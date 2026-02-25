from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import User
from ..auth import get_current_user
from ..quota import check_quota, log_usage
from ..claude_service import call_claude, parse_json
from ..schemas import (
    GenerateWritingRequest, GenerateFillRequest,
    GenerateReadingRequest, GenerateFlashcardsRequest,
    CorrectWritingRequest,
)

router = APIRouter(prefix="/api/generate", tags=["generate"])


@router.post("/writing-topic")
async def writing_topic(
    payload: GenerateWritingRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    check_quota(db, current_user)
    text, tokens = await call_claude(
        "You are an English language teacher. Always respond in valid JSON only, no markdown, no extra text.",
        f'Generate a writing prompt for level {payload.level} on the theme "{payload.theme}". '
        f'Return JSON: {{"prompt": "the full writing prompt in English (2-3 sentences)", '
        f'"hints": ["hint1","hint2","hint3"], "min_words": number}}',
    )
    result = parse_json(text)
    log_usage(db, current_user.id, "writing_generate", tokens, payload.theme)
    return result


@router.post("/correct-writing")
async def correct_writing(
    payload: CorrectWritingRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    check_quota(db, current_user)
    text, tokens = await call_claude(
        "You are an expert English teacher. Respond only with valid JSON, no markdown.",
        f'Correct this {payload.level} level writing. Prompt: "{payload.prompt}"\n'
        f'Student text: "{payload.text}"\n'
        f'Return JSON: {{'
        f'"score": number (0-100), "grammar_score": number (0-100), '
        f'"vocabulary_score": number (0-100), "coherence_score": number (0-100), '
        f'"strengths": ["strength1","strength2"], '
        f'"improvements": ["improvement1","improvement2","improvement3"], '
        f'"corrected_sentences": [{{"original":"...","corrected":"...","explanation":"..."}}], '
        f'"overall_comment": "encouraging overall comment in French"}}',
        max_tokens=1500,
    )
    result = parse_json(text)
    log_usage(db, current_user.id, "writing_correct", tokens, payload.level)
    return result


@router.post("/fill-blanks")
async def fill_blanks(
    payload: GenerateFillRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    check_quota(db, current_user)
    text, tokens = await call_claude(
        "You are an English language teacher. Respond only with valid JSON, no markdown.",
        f'Create 7 fill-in-the-blank sentences for level {payload.level} focusing on {payload.theme}. '
        f'Return JSON array: [{{"sentence":"The sentence with ___ for the blank",'
        f'"answer":"correct word or phrase","explanation":"why this is correct in French"}}] '
        f'Make sentences varied and natural.',
    )
    result = parse_json(text)
    log_usage(db, current_user.id, "fill_generate", tokens, payload.theme)
    return result


@router.post("/reading")
async def reading(
    payload: GenerateReadingRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    check_quota(db, current_user)
    text, tokens = await call_claude(
        "You are an English teacher creating reading comprehension exercises. Respond only with valid JSON, no markdown.",
        f'Create a reading comprehension exercise about "{payload.theme}" at level {payload.level}. '
        f'Return JSON: {{"title":"article title","text":"article text (200-280 words, level {payload.level})",'
        f'"questions":[{{"q":"question in English","options":["A","B","C","D"],"answer":number(0-3 index)}}]}} '
        f'Create exactly 4 questions.',
        max_tokens=1500,
    )
    result = parse_json(text)
    log_usage(db, current_user.id, "reading_generate", tokens, payload.theme)
    return result


@router.post("/flashcards")
async def flashcards(
    payload: GenerateFlashcardsRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    check_quota(db, current_user)
    text, tokens = await call_claude(
        "You are an English vocabulary teacher. Respond only with valid JSON, no markdown.",
        f'Generate 10 flashcards for the theme "{payload.theme}" at level {payload.level}. '
        f'Return JSON array: [{{"word":"English word","pos":"noun/verb/etc","translation":"French translation",'
        f'"example":"example sentence in English","mnemonic":"memory tip in French or empty string"}}] '
        f'Make vocabulary authentic and useful for level {payload.level}.',
    )
    result = parse_json(text)
    log_usage(db, current_user.id, "flashcards_generate", tokens, payload.theme)
    return result
