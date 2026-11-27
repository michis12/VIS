import ActivityKit
import Capacitor
import Foundation
import UserNotifications

/// Rest timer as a Live Activity (Dynamic Island + lock screen) plus a local
/// notification when the rest is over. Driven from src/native.ts – no server, no APNs.
@objc(RestActivityPlugin)
public class RestActivityPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "RestActivityPlugin"
    public let jsName = "RestActivity"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "update", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "end", returnType: CAPPluginReturnPromise)
    ]

    private static let notificationId = "vis.rest"

    override public func load() {
        // App was killed during a rest: don't leave a stale activity behind.
        if #available(iOS 16.2, *) {
            Task { await RestActivities.endExpired() }
        }
    }

    @objc func start(_ call: CAPPluginCall) {
        guard let endMs = call.getDouble("endAt") else {
            call.reject("endAt missing")
            return
        }
        let start = Date(timeIntervalSince1970: (call.getDouble("startAt") ?? Date().timeIntervalSince1970 * 1000) / 1000)
        let end = max(Date(timeIntervalSince1970: endMs / 1000), start.addingTimeInterval(1))
        let attributes = (
            title: call.getString("title") ?? "Pause",
            subtitle: call.getString("subtitle"),
            doneText: call.getString("doneText") ?? "Pause vorbei"
        )
        let notifyTitle = call.getString("notifyTitle") ?? attributes.doneText
        let notifyBody = call.getString("notifyBody") ?? ""

        Self.scheduleNotification(at: end, title: notifyTitle, body: notifyBody)

        guard #available(iOS 16.2, *) else {
            call.resolve(["activity": false])
            return
        }
        Task {
            let ok = await RestActivities.start(
                title: attributes.title, subtitle: attributes.subtitle, doneText: attributes.doneText,
                start: start, end: end)
            call.resolve(["activity": ok])
        }
    }

    @objc func update(_ call: CAPPluginCall) {
        guard let endMs = call.getDouble("endAt") else {
            call.reject("endAt missing")
            return
        }
        let end = Date(timeIntervalSince1970: endMs / 1000)
        Self.moveNotification(to: end)
        guard #available(iOS 16.2, *) else {
            call.resolve()
            return
        }
        Task {
            await RestActivities.update(end: end)
            call.resolve()
        }
    }

    @objc func end(_ call: CAPPluginCall) {
        let finished = call.getBool("finished") ?? false
        UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: [Self.notificationId])
        guard #available(iOS 16.2, *) else {
            call.resolve()
            return
        }
        Task {
            await RestActivities.end(finished: finished)
            call.resolve()
        }
    }

    // MARK: - local notification ("Pause vorbei" on a locked phone)

    private static var pending: (title: String, body: String)?

    private static func scheduleNotification(at date: Date, title: String, body: String) {
        pending = (title, body)
        let center = UNUserNotificationCenter.current()
        center.requestAuthorization(options: [.alert, .sound]) { granted, _ in
            guard granted else { return }
            add(at: date, title: title, body: body)
        }
    }

    private static func moveNotification(to date: Date) {
        guard let p = pending else { return }
        add(at: date, title: p.title, body: p.body)
    }

    private static func add(at date: Date, title: String, body: String) {
        let center = UNUserNotificationCenter.current()
        center.removePendingNotificationRequests(withIdentifiers: [notificationId])
        let wait = date.timeIntervalSinceNow
        guard wait > 0.5 else { return }
        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        content.sound = .default
        content.interruptionLevel = .timeSensitive
        let trigger = UNTimeIntervalNotificationTrigger(timeInterval: wait, repeats: false)
        center.add(UNNotificationRequest(identifier: notificationId, content: content, trigger: trigger))
    }
}

/// All ActivityKit calls in one place.
@available(iOS 16.2, *)
enum RestActivities {
    typealias State = RestActivityAttributes.ContentState

    static func start(title: String, subtitle: String?, doneText: String, start: Date, end: Date) async -> Bool {
        // one rest at a time
        for activity in Activity<RestActivityAttributes>.activities {
            await activity.end(nil, dismissalPolicy: .immediate)
        }
        guard ActivityAuthorizationInfo().areActivitiesEnabled else { return false }
        let attributes = RestActivityAttributes(title: title, subtitle: subtitle, doneText: doneText)
        let state = State(startDate: start, endDate: end, done: false)
        do {
            _ = try Activity.request(
                attributes: attributes,
                content: ActivityContent(state: state, staleDate: end),
                pushType: nil)
            return true
        } catch {
            print("⚡️ RestActivity: could not start – \(error)")
            return false
        }
    }

    static func update(end: Date) async {
        for activity in Activity<RestActivityAttributes>.activities {
            let old = activity.content.state
            let newEnd = max(end, old.startDate.addingTimeInterval(1))
            let state = State(startDate: old.startDate, endDate: newEnd, done: false)
            await activity.update(ActivityContent(state: state, staleDate: newEnd))
        }
    }

    /// finished: the rest ran out → show "Pause vorbei" briefly; otherwise remove right away.
    static func end(finished: Bool) async {
        for activity in Activity<RestActivityAttributes>.activities {
            let old = activity.content.state
            if finished {
                let state = State(startDate: old.startDate, endDate: min(old.endDate, Date()), done: true)
                await activity.end(ActivityContent(state: state, staleDate: nil),
                                   dismissalPolicy: .after(Date().addingTimeInterval(8)))
            } else {
                await activity.end(nil, dismissalPolicy: .immediate)
            }
        }
    }

    static func endExpired() async {
        for activity in Activity<RestActivityAttributes>.activities
        where activity.content.state.endDate < Date().addingTimeInterval(-60) {
            await activity.end(nil, dismissalPolicy: .immediate)
        }
    }
}
