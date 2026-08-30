"""
Twilio SIP/PSTN ↔ LiveKit bridge.
Incoming Twilio call → SIP INVITE → LiveKit SIP Trunk → Room → Agent.
Also exposes TwiML webhook for inbound call routing.
"""
import structlog
from fastapi import APIRouter, Request
from fastapi.responses import Response
from livekit import api as lk_api
from twilio.rest import Client as TwilioClient
from twilio.twiml.voice_response import VoiceResponse, Sip

from server.config import settings

log = structlog.get_logger("sip_bridge")
router = APIRouter(prefix="/sip", tags=["sip"])

_twilio: TwilioClient | None = None


def get_twilio() -> TwilioClient:
    global _twilio
    if _twilio is None:
        _twilio = TwilioClient(settings.twilio_account_sid, settings.twilio_auth_token)
    return _twilio


async def ensure_sip_trunk():
    """Create or verify LiveKit SIP trunk for Twilio inbound."""
    try:
        lk = lk_api.LiveKitAPI(
            settings.livekit_url.replace("wss://", "https://"),
            settings.livekit_api_key,
            settings.livekit_api_secret,
        )
        trunks = await lk.sip.list_sip_trunk()
        for t in trunks:
            if "voxpilot" in (t.name or "").lower():
                log.info("sip_trunk_exists", trunk_id=t.sip_trunk_id)
                return t.sip_trunk_id

        trunk = await lk.sip.create_sip_trunk(
            lk_api.CreateSIPTrunkRequest(
                name="VoxPilot-Twilio",
                numbers=[settings.twilio_phone_number],
                inbound_username="voxpilot",
                inbound_password="changeme-secure-password",
            )
        )
        log.info("sip_trunk_created", trunk_id=trunk.sip_trunk_id)
        return trunk.sip_trunk_id
    except Exception as e:
        log.error("sip_trunk_error", err=str(e))
        return None


async def create_sip_dispatch_rule(room_prefix: str = "pstn-"):
    """Auto-dispatch inbound SIP calls to agent rooms."""
    try:
        lk = lk_api.LiveKitAPI(
            settings.livekit_url.replace("wss://", "https://"),
            settings.livekit_api_key,
            settings.livekit_api_secret,
        )
        rule = await lk.sip.create_sip_dispatch_rule(
            lk_api.CreateSIPDispatchRuleRequest(
                rule=lk_api.SIPDispatchRuleIndividual(room_prefix=room_prefix),
            )
        )
        log.info("dispatch_rule_created", rule_id=rule.sip_dispatch_rule_id)
    except Exception as e:
        log.warning("dispatch_rule_error", err=str(e))


@router.post("/twiml/inbound")
async def twiml_inbound(request: Request):
    """
    Twilio webhook: returns TwiML that SIP-forwards to LiveKit.
    Configure your Twilio number's Voice webhook to POST here.
    """
    form = await request.form()
    caller = form.get("From", "unknown")
    log.info("pstn_inbound", caller=caller)

    resp = VoiceResponse()
    sip_uri = f"sip:voxpilot@{settings.livekit_url.replace('wss://', '')}"
    dial = resp.dial(caller_id=settings.twilio_phone_number, timeout=30)
    dial.sip(sip_uri)

    return Response(content=str(resp), media_type="application/xml")


@router.post("/twiml/status")
async def twiml_status(request: Request):
    """Twilio status callback for call lifecycle events."""
    form = await request.form()
    log.info(
        "pstn_status",
        sid=form.get("CallSid"),
        status=form.get("CallStatus"),
        duration=form.get("CallDuration"),
    )
    return Response(content="<Response/>", media_type="application/xml")


def initiate_outbound_call(to_number: str, room_name: str) -> str | None:
    """Dial out via Twilio → SIP → LiveKit room."""
    try:
        client = get_twilio()
        twiml = f"""
        <Response>
            <Dial>
                <Sip>sip:{room_name}@{settings.livekit_url.replace('wss://', '')}</Sip>
            </Dial>
        </Response>
        """
        call = client.calls.create(
            to=to_number,
            from_=settings.twilio_phone_number,
            twiml=twiml,
        )
        log.info("outbound_call", sid=call.sid, to=to_number, room=room_name)
        return call.sid
    except Exception as e:
        log.error("outbound_call_failed", err=str(e), to=to_number)
        return None