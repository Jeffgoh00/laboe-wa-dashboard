const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function env(name: string, fallback = "") {
  return Deno.env.get(name) || fallback;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return json({ ok: false, error: "Method not allowed" }, 405);
  }

  try {
    const githubToken = env("GITHUB_TOKEN") || env("GITHUB_PAT");
    if (!githubToken) throw new Error("Missing GITHUB_TOKEN function secret.");

    const owner = env("GITHUB_OWNER", "LaboeStudio");
    const repo = env("GITHUB_REPO", "wa-leads");
    const workflowId = env("GITHUB_WORKFLOW_ID", "laboe-collection-worker.yml");
    const ref = env("GITHUB_REF", "main");

    const body = await request.json().catch(() => ({}));
    const collectionDate = String(body.collection_date || "").trim();
    const targetLeads = String(body.target_leads || "100").trim();

    if (!/^\d{4}-\d{2}-\d{2}$/.test(collectionDate)) {
      throw new Error("collection_date must be YYYY-MM-DD.");
    }
    if (!/^\d+$/.test(targetLeads)) {
      throw new Error("target_leads must be a number.");
    }

    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflowId}/dispatches`,
      {
        method: "POST",
        headers: {
          "Accept": "application/vnd.github+json",
          "Authorization": `Bearer ${githubToken}`,
          "Content-Type": "application/json",
          "User-Agent": "laboe-wa-dashboard",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        body: JSON.stringify({
          ref,
          inputs: {
            collection_date: collectionDate,
            target_leads: targetLeads,
          },
        }),
      },
    );

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`GitHub workflow dispatch failed (${response.status}): ${text}`);
    }

    return json({
      ok: true,
      workflow: workflowId,
      repo: `${owner}/${repo}`,
      ref,
      collection_date: collectionDate,
      target_leads: Number(targetLeads),
    }, 202);
  } catch (error) {
    return json({ ok: false, error: error.message || String(error) }, 400);
  }
});

function json(payload: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}
