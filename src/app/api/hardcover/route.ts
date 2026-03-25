export async function POST(request: Request) {
  const token = process.env.HARDCOVER_API_TOKEN;
  if (!token) {
    return Response.json({ error: "Hardcover API not configured" }, { status: 500 });
  }

  const { isbn } = await request.json();
  if (!isbn || typeof isbn !== "string") {
    return Response.json({ error: "ISBN required" }, { status: 400 });
  }

  const isbnField = isbn.length === 10 ? "isbn_10" : "isbn_13";

  const query = `
    query BookByISBN($isbn: String!) {
      books(where: {editions: {${isbnField}: {_eq: $isbn}}}, limit: 1) {
        title
        description
        cached_tags
        cached_contributors
        contributions { author { name } }
        cover_image_url
        editions(where: {${isbnField}: {_eq: $isbn}}, limit: 1) {
          isbn_13
          isbn_10
          pages
          release_date
        }
      }
    }
  `;

  try {
    const res = await fetch("https://api.hardcover.app/v1/graphql", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ query, variables: { isbn } }),
    });

    if (!res.ok) {
      return Response.json({ data: null }, { status: 200 });
    }

    const json = await res.json();
    return Response.json(json);
  } catch {
    return Response.json({ data: null }, { status: 200 });
  }
}
