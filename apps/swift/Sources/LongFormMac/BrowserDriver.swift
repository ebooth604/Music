import Foundation
import WebKit

/// Drives a WKWebView that shares the user's Safari-style persistent data store, so any site the
/// user has signed in to inside the app stays signed in. It never sees or asks for credentials.
///
/// All DOM access goes through one injected helper (`__lf`) that understands the selector
/// extensions used in providers/*.json (`:has-text('…')`, `text=/re/i`).
@MainActor
public final class BrowserDriver: NSObject, WKNavigationDelegate, WKUIDelegate {
    public let webView: WKWebView
    private var navigationContinuation: CheckedContinuation<Void, Error>?
    /// Set when the page opens a JS dialog (alert/confirm/prompt) - treated as a blocker.
    public private(set) var unexpectedDialog: String?

    public init(store: WKWebsiteDataStore = .default()) {
        let cfg = WKWebViewConfiguration()
        cfg.websiteDataStore = store
        cfg.preferences.javaScriptCanOpenWindowsAutomatically = false
        cfg.userContentController.addUserScript(WKUserScript(source: Self.helperJS, injectionTime: .atDocumentEnd, forMainFrameOnly: true))
        webView = WKWebView(frame: .init(x: 0, y: 0, width: 1440, height: 900), configuration: cfg)
        webView.customUserAgent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15"
        super.init()
        webView.navigationDelegate = self
        webView.uiDelegate = self
    }

    // MARK: navigation
    public func navigate(_ url: URL) async throws {
        try await withCheckedThrowingContinuation { (c: CheckedContinuation<Void, Error>) in
            navigationContinuation = c
            webView.load(URLRequest(url: url))
        }
        try await Task.sleep(for: .seconds(1))
    }
    public func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) { navigationContinuation?.resume(); navigationContinuation = nil }
    public func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { navigationContinuation?.resume(throwing: error); navigationContinuation = nil }
    public func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { navigationContinuation?.resume(throwing: error); navigationContinuation = nil }
    public var currentURL: String { webView.url?.absoluteString ?? "" }

    // MARK: JS dialogs → blockers
    public func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo) async { unexpectedDialog = message }
    public func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo) async -> Bool { unexpectedDialog = message; return false }
    public func clearDialog() { unexpectedDialog = nil }

    // MARK: DOM helpers
    @discardableResult
    public func eval<T>(_ js: String, as: T.Type = T.self) async throws -> T? {
        let r = try await webView.evaluateJavaScript(js)
        return r as? T
    }
    public func exists(_ selector: String) async throws -> Bool { try await eval("!!__lf.q(\(json(selector)))") ?? false }
    public func anyExists(_ selectors: [String]) async throws -> String? {
        for s in selectors where try await exists(s) { return s }
        return nil
    }
    public func click(_ selector: String) async throws {
        guard try await eval("__lf.click(\(json(selector)))", as: Bool.self) == true else { throw ClipGeneratorError.selectorNotFound(selector) }
        try await Task.sleep(for: .milliseconds(400))
    }
    public func type(_ selector: String, text: String, clearFirst: Bool) async throws {
        guard try await eval("__lf.type(\(json(selector)), \(json(text)), \(clearFirst))", as: Bool.self) == true else { throw ClipGeneratorError.selectorNotFound(selector) }
    }
    public func attr(_ selector: String, _ name: String) async throws -> String? { try await eval("__lf.attr(\(json(selector)), \(json(name)))") }
    public func setFile(_ inputSelector: String, data: Data, filename: String, mime: String) async throws {
        // Feed the file to the hidden <input type=file> via DataTransfer so the site's upload handler runs as if the user dropped it.
        let b64 = data.base64EncodedString()
        guard try await eval("__lf.setFile(\(json(inputSelector)), \(json(b64)), \(json(filename)), \(json(mime)))", as: Bool.self) == true else { throw ClipGeneratorError.selectorNotFound(inputSelector) }
        try await Task.sleep(for: .seconds(2))
    }
    public func waitFor(_ selector: String, timeout: TimeInterval, poll: TimeInterval = 1, blockers: [String] = []) async throws {
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            if let d = unexpectedDialog { throw ClipGeneratorError.needsUserIntervention("dialog: \(d)") }
            if let b = try await anyExists(blockers) { throw ClipGeneratorError.needsUserIntervention("blocker on page: \(b)") }
            if try await exists(selector) { return }
            try await Task.sleep(for: .seconds(poll))
        }
        throw ClipGeneratorError.timeout("waiting for \(selector)")
    }
    /// Fetches a media URL *inside* the page context so cookies/CORS behave like the site's own player.
    public func fetchBytes(_ url: String) async throws -> Data {
        let b64: String? = try await eval("__lf.fetchB64(\(json(url)))")
        guard let b64, let d = Data(base64Encoded: b64) else { throw ClipGeneratorError.failed("could not download \(url)") }
        return d
    }

    private func json(_ s: String) -> String { String(data: try! JSONEncoder().encode(s), encoding: .utf8)! }

    static let helperJS = #"""
    window.__lf = window.__lf || (() => {
      const textOf = (el) => (el.innerText || el.textContent || "").trim();
      function q(sel) {
        // text=/regex/flags
        const m = sel.match(/^text=\/(.+)\/([a-z]*)$/);
        if (m) { const re = new RegExp(m[1], m[2]); return [...document.querySelectorAll("body *")].find(e => e.children.length === 0 && re.test(textOf(e))) || null; }
        // css:has-text('...') — split on the pseudo, match by inner text
        const parts = sel.split(/:has-text\('([^']*)'\)/);
        let cands = [...document.querySelectorAll(parts[0] || "*")];
        for (let i = 1; i < parts.length; i += 2) { const t = parts[i].toLowerCase(); cands = cands.filter(e => textOf(e).toLowerCase().includes(t)); }
        if (parts.length > 1 && parts[parts.length - 1]) { const rest = parts[parts.length - 1]; cands = cands.filter(e => { try { return e.matches(parts[0] + rest); } catch { return true; } }); }
        return cands.find(e => e.offsetParent !== null || e.tagName === "INPUT") || cands[0] || null;
      }
      function click(sel) { const el = q(sel); if (!el) return false; el.scrollIntoView({block:"center"}); el.click(); return true; }
      function type(sel, text, clear) {
        const el = q(sel); if (!el) return false; el.focus();
        if (el.isContentEditable) { if (clear) el.textContent = ""; document.execCommand("insertText", false, text); }
        else { const proto = Object.getPrototypeOf(el); const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set; setter ? setter.call(el, clear ? text : el.value + text) : (el.value = text); }
        el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
      }
      function attr(sel, name) { const el = q(sel); return el ? (name === "src" ? (el.currentSrc || el.src || el.getAttribute("src")) : el.getAttribute(name)) : null; }
      function setFile(sel, b64, name, mime) {
        const input = q(sel); if (!input) return false;
        const bin = atob(b64); const arr = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
        const file = new File([arr], name, { type: mime }); const dt = new DataTransfer(); dt.items.add(file);
        input.files = dt.files; input.dispatchEvent(new Event("input", { bubbles: true })); input.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
      }
      async function fetchB64(url) {
        const r = await fetch(url, { credentials: "include" }); const buf = await r.arrayBuffer();
        let s = ""; const bytes = new Uint8Array(buf); const chunk = 0x8000;
        for (let i = 0; i < bytes.length; i += chunk) s += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
        return btoa(s);
      }
      return { q, click, type, attr, setFile, fetchB64 };
    })();
    """#
}
