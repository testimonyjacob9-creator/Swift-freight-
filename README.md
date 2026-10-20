# SwiftFreight

Logistics site with live shipment tracking and an admin portal (Firebase Auth, Firestore, Storage).

## Pages
`index.html` home · `track.html` tracking · `contact.html` enquiries · `admin.html` admin portal

## Admin features
- **Product photos:** drag-and-drop or browse; images are resized in the browser and uploaded to Firebase Storage (up to 4 per shipment).
- **Receipt:** open any shipment → **Receipt** → download as PNG or print. Includes a QR code to live tracking.

## One-time Firebase setup
1. Console → **Build → Storage → Get started** (this may require the Blaze plan).
2. `npm i -g firebase-tools && firebase login`
3. `firebase deploy --only firestore:rules,storage` (review `firestore.rules` first; it replaces any rules you have now)
4. So the receipt PNG can include the product photo:
   `gsutil cors set cors.json gs://swiftfreight-8c922.firebasestorage.app`
   (If skipped, receipts still work, just without the photo.)

If Storage isn't enabled, uploads fall back to a compressed inline copy so the app keeps working.
