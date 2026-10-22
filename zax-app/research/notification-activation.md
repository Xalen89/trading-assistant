# Native notification activation sources

Verified 16 October 2026 UTC from official Expo documentation.

[Expo push setup](https://docs.expo.dev/push-notifications/push-notifications-setup/) requires notification permission, an ExpoPushToken attributed to a genuine projectId, Android FCM credentials and iOS APNs/native signing configuration. A development/release build must be created and installed; a push-capable device and an actual test delivery are needed. Our source uses the existing Expo push transport, not a second provider.

[Using push services](https://docs.expo.dev/guides/using-push-notifications-services/) explicitly states that Expo notifications do not support web notifications. Safari/web Preview is therefore not this app's native remote-push route. Native builds, backend publication, authenticated minute-scans, cloud-saved alert rules and device enrollment are separate steps. A configured token or accepted push ticket is not proof of delivery. The current app also rejects Expo Go enrollment for this remote-push route.

No native credentials or device enrollment were changed while implementing chart/direction watches. No backend publication was performed. Direction change detection remains paper analysis and cannot execute broker orders.
