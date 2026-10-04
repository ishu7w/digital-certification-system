import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUpRight, Menu, Pause, Play, X } from "lucide-react";
import type { Page } from "../types";
const VaultScene = lazy(() => import("./VaultScene"));
export default function Experience({
  onEnter,
}: {
  onEnter: (page: Page) => void;
}) {
  const [environment, setEnvironment] = useState(0);
  const [paused, setPaused] = useState(
    () => matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const [menu, setMenu] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const names = ["Blue", "Sage", "Amber"];
  useEffect(() => {
    if (menu) dialog.current?.showModal();
    else dialog.current?.close();
  }, [menu]);
  return (
    <div className={`experience environment-${environment}`}>
      <div className="scroll-scene-stage">
        <Suspense fallback={<div className="vault-scene" />}>
          <VaultScene environment={environment} paused={paused} />
        </Suspense>
        <div className="scene-vignette" />
      </div>
      <header className="experience-header">
        <a href="#" className="experience-logo" aria-label="Credence home">
          credence
        </a>
        <div className="experience-nav">
          <button onClick={() => onEnter("Certificates")}>
            Workspace <ArrowUpRight size={13} />
          </button>
          <span />
          <button
            onClick={() => setMenu(true)}
            aria-label="Open experience menu"
          >
            Menu
            <Menu size={16} />
          </button>
        </div>
      </header>
      <main className="experience-main">
        <h1>
          Credentials,
          <br />
          <span>verified.</span>
        </h1>
        <div className="experience-copy">
          <p>
            Issue digital certificates. Share a link to verify their status.
          </p>
        </div>
        <div className="experience-actions">
          <button
            className="experience-cta"
            onClick={() => onEnter("Verify a certificate")}
          >
            Verify a certificate
            <ArrowUpRight size={19} />
          </button>
          <button
            className="experience-secondary"
            onClick={() => onEnter("Overview")}
          >
            Open workspace <ArrowUpRight size={15} />
          </button>
        </div>
      </main>
      <footer className="experience-footer">
        <button
          className="explore-button"
          onClick={() =>
            document.getElementById("scroll-chapter-one")?.scrollIntoView({
              behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
                ? "instant"
                : "smooth",
            })
          }
        >
          <span className="scroll-circle">
            <ArrowDown size={15} />
          </span>
          Explore
        </button>
        <div
          className="environment-picker"
          role="group"
          aria-label="Scene color"
        >
          {names.map((name, i) => (
            <button
              key={name}
              className={i === environment ? "selected" : ""}
              onClick={() => setEnvironment(i)}
              aria-label={`${name} scene`}
              aria-pressed={environment === i}
            >
              <i className={`scene-swatch swatch-${i}`} />
            </button>
          ))}
        </div>
        <button
          className="motion-control"
          onClick={() => setPaused(!paused)}
          aria-label={paused ? "Play animation" : "Pause animation"}
        >
          {paused ? <Play size={13} /> : <Pause size={13} />}
          <span>{paused ? "Play" : "Pause"}</span>
        </button>
      </footer>
      <section
        className="scroll-chapter"
        id="scroll-chapter-one"
        aria-label="Digital identity chapter"
      >
        <div className="chapter-copy">
          <h2>
            One certificate.
            <br />
            <em>One record.</em>
          </h2>
          <p>
            Each certificate gets a unique ID, a digital signature, and a
            shareable verification link.
          </p>
        </div>
      </section>
      <section
        className="scroll-chapter chapter-right"
        aria-label="Verification chapter"
      >
        <div className="chapter-copy">
          <h2>
            Verification,
            <br />
            <em>in one step.</em>
          </h2>
          <p>
            Enter a certificate ID to check its signature, expiry date, and
            current status. No account required.
          </p>
          <button
            className="experience-cta"
            onClick={() => onEnter("Verify a certificate")}
          >
            Check a certificate <ArrowUpRight size={18} />
          </button>
        </div>
      </section>
      <section className="experience-story" id="experience-story">
        <div className="story-intro">
          <h2>
            From issue
            <br />
            <span>to verification.</span>
          </h2>
          <p>
            Keep issued certificates, verification links, and activity together
            in one workspace.
          </p>
        </div>
        <div className="story-links">
          {[
            {
              title: "Issue certificates",
              copy: "Add the recipient, achievement, and dates. Credence creates the signed record.",
              page: "Overview" as Page,
            },
            {
              title: "Verify a certificate",
              copy: "Check a certificate’s signature and current status with its unique ID.",
              page: "Verify a certificate" as Page,
            },
            {
              title: "Manage your registry",
              copy: "Search certificates, export records, and revoke credentials when needed.",
              page: "Certificates" as Page,
            },
          ].map((item) => (
            <button key={item.page} onClick={() => onEnter(item.page)}>
              <div>
                <h3>{item.title}</h3>
                <p>{item.copy}</p>
              </div>
              <ArrowUpRight />
            </button>
          ))}
        </div>
        <div className="experience-end">
          <span>Credence</span>
          <button onClick={() => onEnter("Overview")}>
            Open workspace <ArrowUpRight size={16} />
          </button>
          <span>Digital certificates</span>
        </div>
      </section>
      <dialog
        ref={dialog}
        className="experience-menu"
        aria-label="Explore Credence"
        onCancel={() => setMenu(false)}
      >
        <div className="experience-menu-top">
          <span>credence</span>
          <button
            onClick={() => setMenu(false)}
            aria-label="Close experience menu"
          >
            <X />
          </button>
        </div>
        <nav aria-label="Experience navigation">
          {(
            [
              "Overview",
              "Certificates",
              "Verify a certificate",
              "Activity",
              "Workspace",
            ] as Page[]
          ).map((page) => (
            <button key={page} onClick={() => onEnter(page)}>
              {page}
              <ArrowUpRight />
            </button>
          ))}
        </nav>
      </dialog>
    </div>
  );
}
