import ARKit
import Capacitor
import UIKit

/// Push-up counter with the TrueDepth (Face ID) camera: the phone lies on the floor
/// under the face, ARKit face tracking measures the distance from the face to the
/// phone, and every "down and back up" counts as one rep. Driven from src/native.ts.
///
/// Events to the web app:
///   "rep"      { count }                      one rep done
///   "distance" { meters, down, tracking }     ~10× per second, for the live bar
@objc(PushupCounterPlugin)
public class PushupCounterPlugin: CAPPlugin, CAPBridgedPlugin, ARSessionDelegate {
    public let identifier = "PushupCounterPlugin"
    public let jsName = "PushupCounter"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise)
    ]

    private var session: ARSession?
    private let haptic = UIImpactFeedbackGenerator(style: .medium)

    // rep detection on the smoothed face distance (meters)
    private var smooth: Float = 0
    private var top: Float = 0          // highest point of the current rep (arms straight)
    private var bottom: Float = 10      // lowest point of the current rep (chest down)
    private var isDown = false
    private var count = 0
    private var lastEmit: TimeInterval = 0
    private var tracking = false

    /// How far the face has to come down (and back up) for a rep, in meters, at least.
    private let minTravel: Float = 0.08

    @objc func isAvailable(_ call: CAPPluginCall) {
        call.resolve(["available": ARFaceTrackingConfiguration.isSupported])
    }

    @objc func start(_ call: CAPPluginCall) {
        guard ARFaceTrackingConfiguration.isSupported else {
            call.reject("Face tracking needs an iPhone with Face ID")
            return
        }
        DispatchQueue.main.async {
            self.reset()
            let config = ARFaceTrackingConfiguration()
            config.maximumNumberOfTrackedFaces = 1
            let s = self.session ?? ARSession()
            s.delegate = self
            self.session = s
            s.run(config, options: [.resetTracking, .removeExistingAnchors])
            UIApplication.shared.isIdleTimerDisabled = true
            self.haptic.prepare()
            call.resolve()
        }
    }

    @objc func stop(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.session?.pause()
            UIApplication.shared.isIdleTimerDisabled = false
            call.resolve(["count": self.count])
        }
    }

    private func reset() {
        smooth = 0; top = 0; bottom = 10; isDown = false; count = 0; tracking = false; lastEmit = 0
    }

    public func session(_ session: ARSession, didUpdate frame: ARFrame) {
        let face = frame.anchors.compactMap { $0 as? ARFaceAnchor }.first
        guard let face, face.isTracked else {
            if tracking {
                tracking = false
                notifyListeners("distance", data: ["meters": Double(smooth), "down": isDown, "tracking": false])
            }
            return
        }
        tracking = true
        let cam = frame.camera.transform.columns.3
        let pos = face.transform.columns.3
        let d = simd_distance(SIMD3(cam.x, cam.y, cam.z), SIMD3(pos.x, pos.y, pos.z))
        // light smoothing against jitter, still fast enough for quick reps
        smooth = smooth == 0 ? d : smooth * 0.6 + d * 0.4

        if !isDown {
            top = max(top, smooth)
            // clearly below the top: on the way down
            if top - smooth > max(minTravel, top * 0.3) {
                isDown = true
                bottom = smooth
            }
        } else {
            bottom = min(bottom, smooth)
            // back up most of the way: one rep
            if smooth - bottom > max(minTravel, (top - bottom) * 0.6) {
                isDown = false
                count += 1
                top = smooth
                haptic.impactOccurred()
                haptic.prepare()
                notifyListeners("rep", data: ["count": count])
            }
        }

        let now = frame.timestamp
        if now - lastEmit > 0.1 {
            lastEmit = now
            notifyListeners("distance", data: ["meters": Double(smooth), "down": isDown, "tracking": true])
        }
    }

    public func session(_ session: ARSession, didFailWithError error: Error) {
        notifyListeners("distance", data: ["meters": 0, "down": false, "tracking": false])
    }
}
