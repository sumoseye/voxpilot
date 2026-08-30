"""
Provision Twilio SIP trunk + LiveKit SIP dispatch rules.
Run once to configure PSTN ↔ LiveKit bridge.
"""
import asyncio
import os
import sys

from dotenv import load_dotenv
from twilio.rest import Client

load_dotenv()

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from server.config import settings
from server.sip_bridge import create_sip_dispatch_rule, ensure_sip_trunk


async def main():
    print("VoxPilot — SIP Trunk Provisioner\n")

    # 1. Twilio side
    if settings.twilio_account_sid and settings.twilio_auth_token:
        client = Client(settings.twilio_account_sid, settings.twilio_auth_token)

        # Check/create SIP domain
        print(f"  Twilio Phone: {settings.twilio_phone_number}")

        domains = client.sip.domains.list()
        found = any(d.domain_name == settings.twilio_sip_domain for d in domains)
        if not found:
            domain = client.sip.domains.create(
                domain_name=settings.twilio_sip_domain,
                friendly_name="VoxPilot",
            )
            print(f"  ✓ Created SIP domain: {domain.domain_name}")
        else:
            print(f"  ✓ SIP domain exists: {settings.twilio_sip_domain}")

        # Configure voice URL
        numbers = client.incoming_phone_numbers.list(phone_number=settings.twilio_phone_number)
        if numbers:
            numbers[0].update(
                voice_url=f"https://your-server.com/sip/twiml/inbound",
                voice_method="POST",
                status_callback=f"https://your-server.com/sip/twiml/status",
                status_callback_method="POST",
            )
            print(f"  ✓ Configured webhooks for {settings.twilio_phone_number}")
    else:
        print("  ⚠ Twilio credentials not set, skipping")

    # 2. LiveKit side
    print()
    trunk_id = await ensure_sip_trunk()
    if trunk_id:
        print(f"  ✓ LiveKit SIP Trunk: {trunk_id}")
        await create_sip_dispatch_rule(room_prefix="pstn-")
        print(f"  ✓ Dispatch rule created (prefix: pstn-)")
    else:
        print("  ⚠ LiveKit SIP trunk setup failed")

    print("\n  Done! Inbound calls will route to agent rooms.")


if __name__ == "__main__":
    asyncio.run(main())