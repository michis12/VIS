import ActivityKit
import Foundation

/// Shared between the app (starts / updates / ends the activity) and the RestWidget
/// extension (draws it). Keep this file in both targets.
@available(iOS 16.1, *)
struct RestActivityAttributes: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        /// When this rest started – the ring runs from here …
        var startDate: Date
        /// … to here. The system counts down on its own (Text(timerInterval:)), no updates needed.
        var endDate: Date
        /// The rest ran out (shown until the activity is dismissed).
        var done: Bool
    }

    /// "Pause" / "Rest"
    var title: String
    /// "Danach: Bankdrücken" – optional
    var subtitle: String?
    /// "Pause vorbei" / "Rest over"
    var doneText: String
}
