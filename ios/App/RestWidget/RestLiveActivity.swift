import ActivityKit
import SwiftUI
import WidgetKit

/// VIS rest timer in the Dynamic Island and on the lock screen.
/// Everything counts down on its own (ProgressView/Text with timerInterval) – the app
/// only starts, moves and ends the activity, there are no per-second updates.
struct RestLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: RestActivityAttributes.self) { context in
            LockScreenView(context: context)
                .activityBackgroundTint(Color.black.opacity(0.78))
                .activitySystemActionForegroundColor(.white)
        } dynamicIsland: { context in
            let over = isOver(context)
            return DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    RestRing(state: context.state, over: over, lineWidth: 6)
                        .frame(width: 52, height: 52)
                        .padding(.leading, 4)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Group {
                        if over {
                            Image(systemName: "checkmark.circle.fill").foregroundStyle(VIS.good)
                        } else {
                            Text(timerInterval: context.state.startDate...context.state.endDate, countsDown: true)
                                .monospacedDigit()
                                .multilineTextAlignment(.trailing)
                        }
                    }
                    .font(.system(size: 38, weight: .semibold, design: .rounded))
                    .frame(maxWidth: 130, alignment: .trailing)
                    .padding(.trailing, 4)
                }
                DynamicIslandExpandedRegion(.center) {
                    Text(over ? context.attributes.doneText : context.attributes.title)
                        .font(.headline)
                        .foregroundStyle(over ? VIS.good : .white)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    if let sub = context.attributes.subtitle {
                        Text(sub)
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                    }
                }
            } compactLeading: {
                RestRing(state: context.state, over: over, lineWidth: 3)
                    .frame(width: 20, height: 20)
            } compactTrailing: {
                if over {
                    Image(systemName: "checkmark").foregroundStyle(VIS.good)
                } else {
                    Text(timerInterval: context.state.startDate...context.state.endDate, countsDown: true)
                        .monospacedDigit()
                        .multilineTextAlignment(.trailing)
                        .frame(maxWidth: 44)
                        .foregroundStyle(VIS.ring)
                }
            } minimal: {
                RestRing(state: context.state, over: over, lineWidth: 3)
                    .frame(width: 20, height: 20)
            }
            .keylineTint(VIS.ring)
        }
    }
}

private enum VIS {
    /// --good in the web app
    static let good = Color(red: 0x8F / 255, green: 0xD1 / 255, blue: 0x9E / 255)
    static let ring = Color(red: 0xE5 / 255, green: 0xE5 / 255, blue: 0xEA / 255)
}

private func isOver(_ context: ActivityViewContext<RestActivityAttributes>) -> Bool {
    context.state.done || context.isStale
}

/// Ring that empties by itself until endDate.
private struct RestRing: View {
    let state: RestActivityAttributes.ContentState
    let over: Bool
    let lineWidth: CGFloat

    var body: some View {
        if over {
            Circle()
                .stroke(VIS.good, lineWidth: lineWidth)
        } else {
            ProgressView(timerInterval: state.startDate...state.endDate, countsDown: true) {
                EmptyView()
            } currentValueLabel: {
                EmptyView()
            }
            .progressViewStyle(.circular)
            .tint(VIS.ring)
        }
    }
}

private struct LockScreenView: View {
    let context: ActivityViewContext<RestActivityAttributes>

    var body: some View {
        let over = isOver(context)
        HStack(spacing: 16) {
            RestRing(state: context.state, over: over, lineWidth: 6)
                .frame(width: 56, height: 56)
                .overlay {
                    Image(systemName: over ? "checkmark" : "pause.fill")
                        .font(.system(size: 18, weight: .bold))
                        .foregroundStyle(over ? VIS.good : .white)
                }
            VStack(alignment: .leading, spacing: 2) {
                Text(over ? context.attributes.doneText : context.attributes.title)
                    .font(.headline)
                    .foregroundStyle(over ? VIS.good : .white)
                if let sub = context.attributes.subtitle {
                    Text(sub)
                        .font(.subheadline)
                        .foregroundStyle(.white.opacity(0.65))
                        .lineLimit(1)
                }
            }
            Spacer(minLength: 8)
            if !over {
                Text(timerInterval: context.state.startDate...context.state.endDate, countsDown: true)
                    .font(.system(size: 42, weight: .semibold, design: .rounded))
                    .monospacedDigit()
                    .multilineTextAlignment(.trailing)
                    .frame(maxWidth: 140, alignment: .trailing)
                    .foregroundStyle(.white)
            }
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 16)
    }
}
