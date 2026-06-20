import time
import arxiv

def search_arxiv(query: str, max_results: int = 8) -> str:
    """Search arxiv.org for academic papers on a given topic.

    Use this tool when you need to find peer-reviewed or preprint research papers,
    not for general web searches. Returns paper titles, authors, publication year,
    abstracts, and URLs.

    Args:
        query: The search query, e.g. "transformer models for NLP" or "CRISPR gene editing"
        max_results: Maximum number of papers to return (default 8, max 8)

    Returns:
        A formatted string with paper details separated by ---
    """
    max_results = min(int(max_results), 8)

    client = arxiv.Client(delay_seconds=3.0, num_retries=3)
    search = arxiv.Search(
        query=query,
        max_results=max_results,
        sort_by=arxiv.SortCriterion.Relevance,
    )

    results = []
    for attempt in range(3):
        try:
            for paper in client.results(search):
                results.append(
                    f"Title: {paper.title}\n"
                    f"Authors: {', '.join(a.name for a in paper.authors)}\n"
                    f"Year: {paper.published.year}\n"
                    f"Abstract: {paper.summary[:600]}...\n"
                    f"URL: {paper.entry_id}\n"
                )
            break
        except arxiv.HTTPError as e:
            if e.status == 429 and attempt < 2:
                time.sleep(10 * (attempt + 1))
                continue
            return f"arxiv search failed: {e}"

    return "\n---\n".join(results) if results else "No papers found."
