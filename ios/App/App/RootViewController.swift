import Capacitor
import UIKit

/// Capacitor's web view registering the app's own plugins.
class VISBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(RestActivityPlugin())
        bridge?.registerPluginInstance(NativeTabsPlugin())
    }
}

/// Root of the app window: the web view fills the screen; on iOS 26+ a real
/// UITabBarController (Liquid Glass) floats above it once the web app asks for it.
/// The tab controller only provides the bar – its pages are empty and transparent, so
/// every touch outside the bar goes straight to the web view (see PassThroughView).
final class RootViewController: UIViewController, UITabBarControllerDelegate {
    struct Tab {
        let id: String
        let label: String
        let icon: String
    }

    static weak var current: RootViewController?

    let bridgeController = VISBridgeViewController()
    private var tabController: UITabBarController?
    private var tabIds: [String] = []
    private var lastInset: CGFloat = -1
    private var tabBarVisible = true
    /// Black band behind the bar: the Liquid Glass refracts this instead of the bright
    /// web content, so the bar looks dark. Strength: see GlassBackdrop.
    private let backdrop = GlassBackdrop()

    var onTabSelected: ((String) -> Void)?
    var onBottomInset: ((CGFloat) -> Void)?

    override func loadView() {
        view = PassThroughView()
        view.backgroundColor = .black
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        RootViewController.current = self
        addChild(bridgeController)
        bridgeController.view.frame = view.bounds
        bridgeController.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        view.addSubview(bridgeController.view)
        bridgeController.didMove(toParent: self)
        (view as? PassThroughView)?.content = bridgeController.view

        #if DEBUG
        // UI check without tapping through the app: `simctl launch … -VISDemoRest 90`
        let args = ProcessInfo.processInfo.arguments
        if let i = args.firstIndex(of: "-VISDemoRest"), #available(iOS 16.2, *) {
            let sec = (i + 1 < args.count ? Double(args[i + 1]) : nil) ?? 90
            Task {
                _ = await RestActivities.start(title: "Pause", subtitle: "Danach: Bankdrücken", doneText: "Pause vorbei",
                                               start: Date(), end: Date().addingTimeInterval(sec))
            }
        }
        #endif
    }

    // status bar + orientation are decided by Capacitor's controller
    override var childForStatusBarStyle: UIViewController? { bridgeController }
    override var childForStatusBarHidden: UIViewController? { bridgeController }
    override var supportedInterfaceOrientations: UIInterfaceOrientationMask {
        bridgeController.supportedInterfaceOrientations
    }

    // MARK: - tabs

    /// Height the tab bar covers at the bottom of the screen (incl. home indicator), in points.
    var tabBarInset: CGFloat {
        guard let bar = tabController?.tabBar, tabBarVisible, bar.window != nil else { return 0 }
        let frame = bar.convert(bar.bounds, to: view)
        return max(0, view.bounds.maxY - frame.minY)
    }

    @available(iOS 26.0, *)
    func configureTabs(_ tabs: [Tab], selected: String) {
        let tbc = tabController ?? makeTabController()
        tabIds = tabs.map(\.id)
        let pages = tabs.enumerated().map { index, tab -> UIViewController in
            let page = UIViewController()
            page.view.backgroundColor = .clear
            // the web app's own icons (Assets.xcassets/tab-<id>[-on]), SF Symbol as fallback
            if let off = UIImage(named: "tab-\(tab.id)"), let on = UIImage(named: "tab-\(tab.id)-on") {
                page.tabBarItem = UITabBarItem(title: tab.label,
                                               image: off.withRenderingMode(.alwaysOriginal),
                                               selectedImage: on.withRenderingMode(.alwaysOriginal))
            } else {
                page.tabBarItem = UITabBarItem(title: tab.label, image: UIImage(systemName: tab.icon), tag: index)
            }
            return page
        }
        tbc.setViewControllers(pages, animated: false)
        selectTab(selected)
        view.setNeedsLayout()
        view.layoutIfNeeded()
    }

    func selectTab(_ id: String) {
        guard let tbc = tabController, let index = tabIds.firstIndex(of: id), tbc.selectedIndex != index else { return }
        tbc.selectedIndex = index
    }

    func setTabBarVisible(_ visible: Bool) {
        guard let tbc = tabController, visible != tabBarVisible else { return }
        tabBarVisible = visible
        if #available(iOS 18.0, *) {
            tbc.setTabBarHidden(!visible, animated: true)
        } else {
            tbc.tabBar.isHidden = !visible
        }
        (view as? PassThroughView)?.tabBarEnabled = visible
        UIView.animate(withDuration: 0.25) { self.backdrop.alpha = visible ? 1 : 0 }
    }

    private func makeTabController() -> UITabBarController {
        let tbc = UITabBarController()
        tbc.delegate = self
        tbc.view.backgroundColor = .clear
        tbc.overrideUserInterfaceStyle = .dark // the app is dark only
        // label colours like the web tab bar (selected #f5f5f7, others grey)
        tbc.tabBar.tintColor = UIColor(red: 0xF5 / 255, green: 0xF5 / 255, blue: 0xF7 / 255, alpha: 1)
        tbc.tabBar.unselectedItemTintColor = UIColor(red: 0x8E / 255, green: 0x8E / 255, blue: 0x93 / 255, alpha: 1)
        // bar colour like the web app's cards (Gewicht / Phase): --surface #0b0b0c, border --line
        let look = UITabBarAppearance()
        look.configureWithDefaultBackground()
        look.backgroundEffect = nil
        look.backgroundColor = UIColor(red: 0x0B / 255, green: 0x0B / 255, blue: 0x0C / 255, alpha: 1)
        look.shadowColor = UIColor.white.withAlphaComponent(0.07)
        tbc.tabBar.standardAppearance = look
        tbc.tabBar.scrollEdgeAppearance = look
        addChild(tbc)
        tbc.view.frame = view.bounds
        tbc.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        view.addSubview(tbc.view)
        tbc.didMove(toParent: self)
        view.insertSubview(backdrop, belowSubview: tbc.view)
        (view as? PassThroughView)?.tabs = tbc.view
        tabController = tbc
        return tbc
    }

    func tabBarController(_ tabBarController: UITabBarController, didSelect viewController: UIViewController) {
        let index = tabBarController.selectedIndex
        guard tabIds.indices.contains(index) else { return }
        onTabSelected?(tabIds[index])
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        let inset = tabBarInset
        if inset > 0 {
            // a little higher than the bar so its top edge fades in softly
            let h = inset + GlassBackdrop.fadeHeight
            backdrop.frame = CGRect(x: 0, y: view.bounds.maxY - h, width: view.bounds.width, height: h)
            // fully black only from the vertical middle of the bar (without the home indicator area)
            backdrop.solidFrom = GlassBackdrop.fadeHeight + max(0, inset - view.safeAreaInsets.bottom) / 2
            backdrop.setNeedsLayout()
        }
        if inset > 0, abs(inset - lastInset) > 0.5 {
            lastInset = inset
            onBottomInset?(inset)
        }
    }
}

/// Solid black band, fading in from the top, sitting between the web view and the tab bar.
final class GlassBackdrop: UIView {
    /// how dark (0…1) and how far above the bar the fade starts
    static let darkness: CGFloat = 1
    static let fadeHeight: CGFloat = 14

    private let tint = UIView()
    private let fade = CAGradientLayer()
    /// distance from the top where the fade reaches full black
    var solidFrom: CGFloat = fadeHeight

    override init(frame: CGRect) {
        super.init(frame: frame)
        isUserInteractionEnabled = false
        tint.backgroundColor = UIColor.black.withAlphaComponent(Self.darkness)
        addSubview(tint)
        fade.colors = [UIColor.clear.cgColor, UIColor.black.cgColor, UIColor.black.cgColor]
        layer.mask = fade
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    override func layoutSubviews() {
        super.layoutSubviews()
        tint.frame = bounds
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        fade.frame = bounds
        let edge = bounds.height > 0 ? NSNumber(value: Double(min(1, solidFrom / bounds.height))) : 0
        fade.locations = [0, edge, 1]
        CATransaction.commit()
    }
}

/// Lets touches through the (transparent) tab controller to the web view – except on the bar itself.
final class PassThroughView: UIView {
    weak var content: UIView?
    weak var tabs: UIView?
    var tabBarEnabled = true

    override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
        if let tabs, tabBarEnabled,
           let hit = tabs.hitTest(convert(point, to: tabs), with: event),
           Self.belongsToTabBar(hit, below: tabs) {
            return hit
        }
        if let content {
            return content.hitTest(convert(point, to: content), with: event)
        }
        return super.hitTest(point, with: event)
    }

    /// True if `view` is (inside) the tab bar and not just the empty page / container behind it.
    private static func belongsToTabBar(_ view: UIView, below root: UIView) -> Bool {
        var v: UIView? = view
        while let current = v, current !== root {
            if current is UITabBar || String(describing: type(of: current)).contains("TabBar") { return true }
            v = current.superview
        }
        return false
    }
}
