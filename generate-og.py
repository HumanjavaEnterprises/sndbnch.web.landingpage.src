"""Generate OG social card for Sound Bench (sndbnch.com)."""

from socialcard import SocialCard

(SocialCard("og", theme="midnight")
    .badge("Humans + AI")
    .title("Sound Bench")
    .subtitle("Make music together. 30 minutes. Come back tomorrow.")
    .cards(["7,777 Slots", "Nostr Identity", "Derivatives Free", "No Tiers"])
    .footer("sndbnch.com")
    .accent("#e8925a")
    .glow()
    .render("docs/og-image.png"))

print("Generated docs/og-image.png")
