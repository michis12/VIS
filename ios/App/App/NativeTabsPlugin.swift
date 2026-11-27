import Capacitor
import Foundation

/// Native iOS 26 tab bar (Liquid Glass) for the web app. The web app sends the tabs and
/// the selected one (src/native.ts) and gets "tabChange" back when a tab is tapped.
/// On iOS < 26 `configure` answers available: false and the web keeps its own tab bar.
@objc(NativeTabsPlugin)
public class NativeTabsPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "NativeTabsPlugin"
    public let jsName = "NativeTabs"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "configure", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "select", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setVisible", returnType: CAPPluginReturnPromise)
    ]

    private var root: RootViewController? { RootViewController.current }

    @objc func configure(_ call: CAPPluginCall) {
        let raw = call.getArray("tabs", JSObject.self) ?? []
        let tabs = raw.compactMap { o -> RootViewController.Tab? in
            guard let id = o["id"] as? String else { return nil }
            return .init(id: id, label: o["label"] as? String ?? id, icon: o["icon"] as? String ?? "circle")
        }
        let selected = call.getString("selected") ?? tabs.first?.id ?? ""
        DispatchQueue.main.async {
            guard #available(iOS 26.0, *), let root = self.root, !tabs.isEmpty else {
                call.resolve(["available": false])
                return
            }
            root.onTabSelected = { [weak self] id in
                self?.notifyListeners("tabChange", data: ["id": id])
            }
            root.onBottomInset = { [weak self] bottom in
                self?.notifyListeners("layout", data: ["bottom": bottom])
            }
            root.configureTabs(tabs, selected: selected)
            call.resolve(["available": true, "bottom": root.tabBarInset])
        }
    }

    @objc func select(_ call: CAPPluginCall) {
        let id = call.getString("id") ?? ""
        DispatchQueue.main.async {
            self.root?.selectTab(id)
            call.resolve()
        }
    }

    @objc func setVisible(_ call: CAPPluginCall) {
        let visible = call.getBool("visible") ?? true
        DispatchQueue.main.async {
            self.root?.setTabBarVisible(visible)
            call.resolve()
        }
    }
}
