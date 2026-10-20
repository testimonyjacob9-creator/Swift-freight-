# Swift Air Cargo

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

## Swift Air Cargo – admin & chat (v3)

**Deploy the new Firestore rules** (required for settings, reviews and live chat):
`firebase deploy --only firestore:rules`

- Admin → **Settings**: office locations, phone, email, WhatsApp number (default +31657446248), prefilled WhatsApp message, chat greeting, receipt payment instructions/terms. The public site updates instantly.
- Admin → **Live Chat**: real-time inbox. Visitors talk to an automated assistant until they ask for a human; then their messages arrive here and your replies appear in their chat. They can also continue on WhatsApp with a prefilled message.
- Admin → **Shipments**: 12-character tracking IDs (auto-generated), sender/consignee details, payment status, status history, CSV export, order receipt as **PDF**, image, print or WhatsApp.
- Admin → **Reviews**: add genuine customer reviews. The Reviews section on the home page stays hidden until you add one.

## Receipts tab (admin → 🧾 Receipts)
Build a receipt from scratch or start from a shipment: edit sender/consignee, add price line items, discount, payment method and status, payment instructions and a note, with a live preview. Toggle **Show prices** and the stamp, then **Save**, **PDF**, **Image**, **Print**, or **Share** (attaches the real file via the phone share sheet). Saved receipts are listed under the preview.
**Deploy the updated rules** so receipts can be saved: `firebase deploy --only firestore:rules`
