# Plot weekly newsletter master

Saved in Plot's Brevo account as **Plot weekly newsletter - master**, template **5**, inactive. Sender: news@theplot.tv. This is a reusable HTML layout, not a drag-and-drop design or a scheduled campaign. It contains instructions rather than the unapproved October 19 issue.

After Savannah approves an issue in Notion, duplicate this master or use its layout for a new marketing campaign. Set the approved subject and preview text. Replace the instruction blocks with the approved rendered body. Upload the branded cover and any chosen GIF to Brevo and use their hosted URLs; preserve sourced promotional image URLs and captions. Use the email version's clickable trailer preview, not the review's iframe. Keep the small attribution and `{{ unsubscribe }}` footer. Remove every instruction block before previewing.

The existing renderer supplies the full layout for each approved issue; its HTML can replace the duplicated template's HTML in one paste. Set the Brevo unsubscribe placeholder to `{{ unsubscribe }}` when preparing that export. Check the mobile preview and all links before requesting send approval. No recipient list, campaign, automation, test email, or send was created with this master.

`build-template.mjs` rebuilds the local backup only. It does not call Brevo or send email. `template.json` records the verified Brevo template ID. Do not overwrite the master with one week's issue; keep each campaign separate.
