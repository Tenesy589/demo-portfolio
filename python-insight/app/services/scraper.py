"""Concurrent web scraping: asyncio + httpx for I/O, HTML parsing pushed to a
thread so the event loop never blocks on CPU work."""

import asyncio
import re
import time
from collections import Counter

import httpx
from bs4 import BeautifulSoup

STOPWORDS = set("the a an and or of to in for on with is are be by at as it this that from your you we our".split())


def _parse(html: str) -> dict:
    soup = BeautifulSoup(html, "html.parser")
    for tag in soup(["script", "style", "noscript"]):
        tag.decompose()
    words = [w for w in re.findall(r"[a-zA-Zа-яА-ЯіїєІЇЄ]{3,}", soup.get_text(" ").lower()) if w not in STOPWORDS]
    return {
        "title": soup.title.string.strip() if soup.title and soup.title.string else None,
        "description": (soup.find("meta", attrs={"name": "description"}) or {}).get("content"),
        "links": len(soup.find_all("a", href=True)),
        "headings": [h.get_text(strip=True) for h in soup.find_all(["h1", "h2"])][:5],
        "word_count": len(words),
        "top_words": Counter(words).most_common(8),
    }


async def scrape(urls: list[str], concurrency: int = 5) -> dict:
    sem = asyncio.Semaphore(concurrency)
    started = time.perf_counter()

    async with httpx.AsyncClient(timeout=10, follow_redirects=True, headers={"User-Agent": "InsightBot/1.0"}) as client:

        async def one(url: str) -> dict:
            async with sem:
                t0 = time.perf_counter()
                try:
                    r = await client.get(url)
                    data = await asyncio.to_thread(_parse, r.text)
                    return {"url": url, "status": r.status_code, "ms": round((time.perf_counter() - t0) * 1000), **data}
                except httpx.HTTPError as e:
                    return {"url": url, "error": type(e).__name__, "ms": round((time.perf_counter() - t0) * 1000)}

        results = await asyncio.gather(*(one(u) for u in urls))

    total_ms = round((time.perf_counter() - started) * 1000)
    return {"total_ms": total_ms, "sequential_ms_estimate": sum(r["ms"] for r in results), "results": results}
