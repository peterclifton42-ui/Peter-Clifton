import { ClayDownload } from "../../clay-download";
import { ROLE_HELP, ROLE_LABEL, ROLES, personasFor } from "@/lib/personas";

// "Who to target" on a product page: the roles in a deal and, for each persona,
// what to search for in a prospecting tool, plus the Clay downloads.
export function WhoToTarget({ productSlug, productName }: { productSlug: string; productName: string }) {
  const map = personasFor(productSlug);
  if (!map) return null;
  const href = (scope: string) => `/api/clay?product=${productSlug}&scope=${scope}`;
  return (
    <section className="panel personas" id="personas">
      <div className="panel-head">
        <div>
          <h2>Who to target</h2>
          <p className="dim">
            The people to reach at each institution for {productName}, and what to search for in Clay or LinkedIn.{" "}
            {map.reviewed ? "Reviewed by Product Marketing." : <span className="badge status-estimated" title="Personas marked curinos.com come from Curinos's own persona pages; the rest is a draft awaiting Product Marketing review.">Draft: awaiting review</span>}
          </p>
        </div>
        <div className="clay-export">
          <span className="dim small">Download for Clay</span>
          <ClayDownload className="button" href={href("targets")}>Priority 1–2 targets</ClayDownload>
          <ClayDownload className="button secondary" href={href("book")}>Your book</ClayDownload>
          <ClayDownload className="button secondary" href={href("all")}>Every institution it fits</ClayDownload>
        </div>
      </div>
      {map.note && <p className="ws-hint">{map.note}</p>}
      <div className="persona-roles">
        {ROLES.map((role) => {
          const lines = map.lines.filter((l) => l.role === role);
          if (!lines.length) return null;
          return (
            <div key={role} className={`persona-role role-${role}`}>
              <h3>{ROLE_LABEL[role]} <span className="dim">{ROLE_HELP[role]}</span></h3>
              {lines.map(({ id, persona, site }) => (
                <details key={id} className="persona">
                  <summary>
                    <b>{persona.label}</b>
                    {site && persona.page && <a href={persona.page} target="_blank" rel="noreferrer" className="persona-src" title="Curinos's own persona page lists this product">curinos.com</a>}
                    <span className="persona-eg">{persona.titles.slice(0, 2).join(" · ")} <span className="dim">· {persona.seniority.join(", ")}</span></span>
                  </summary>
                  <dl>
                    <dt>Typical titles</dt><dd>{persona.titles.join("; ")}</dd>
                    <dt>At credit unions</dt><dd>{persona.cuTitles.join("; ")}</dd>
                    <dt>Title keywords</dt><dd>{persona.include.map((k) => <code key={k}>{k}</code>)}</dd>
                    <dt>Exclude</dt><dd>{persona.exclude.map((k) => <code key={k} className="ex">{k}</code>)}</dd>
                    <dt>Department</dt><dd>{persona.department}</dd>
                    {persona.note && <><dt>Note</dt><dd>{persona.note}</dd></>}
                  </dl>
                </details>
              ))}
            </div>
          );
        })}
      </div>
      <p className="dim small">
        Each download has one row per institution and persona: the company name and website domain, the titles, keywords, seniority and
        department to search for, and anyone the research already names in that role. Institutions where the team has marked the product
        client, not a fit or recently lost are left out.
      </p>
    </section>
  );
}
