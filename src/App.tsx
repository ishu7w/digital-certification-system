import { useCallback, useEffect, useRef, useState } from "react";
import {
  LayoutDashboard,
  Award,
  ShieldCheck,
  Activity as ActivityIcon,
  Settings2,
  ArrowUpRight,
  ArrowRight,
  Plus,
  Search,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  Download,
  Clock3,
  CircleCheck,
  Ban,
  Menu,
  X,
  LogOut,
  Command,
  Check,
  FileCheck2,
  BookOpen,
  CircleHelp,
} from "lucide-react";
import { api, dateLabel, exportCsv } from "./api";
import type { Certificate, Activity, Page, Session } from "./types";
import {
  Badge,
  Brand,
  CertificateTable,
  Empty,
  TrustNote,
} from "./components/ui";
import { LoginForm, IssueForm } from "./components/Forms";
import { CertificateDetail } from "./components/CertificateDetail";
import { Verification } from "./components/Verification";
const navigation = [
  { name: "Overview" as Page, icon: LayoutDashboard },
  { name: "Certificates" as Page, icon: Award },
  { name: "Verify a certificate" as Page, icon: ShieldCheck },
  { name: "Activity" as Page, icon: ActivityIcon },
];
export default function App() {
  const initialId =
    new URLSearchParams(window.location.search).get("verify") || "";
  const [page, setPage] = useState<Page>(
    initialId ? "Verify a certificate" : "Overview",
  );
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("All certificates");
  const [login, setLogin] = useState(false);
  const [issue, setIssue] = useState(false);
  const [selected, setSelected] = useState<Certificate | null>(null);
  const [toast, setToast] = useState("");
  const [mobileNav, setMobileNav] = useState(false);
  const [tablePage, setTablePage] = useState(1);
  const searchRef = useRef<HTMLInputElement>(null);
  const refresh = useCallback(async () => {
    setError("");
    try {
      const current = await api<Session>("/session");
      setSession(current);
      if (current.role === "admin" || current.demoMode) {
        const [records, events] = await Promise.all([
          api<Certificate[]>("/certificates"),
          api<Activity[]>("/activity"),
        ]);
        setCertificates(records);
        setActivity(events);
      } else {
        setCertificates([]);
        setActivity([]);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(""), 4500);
      return () => clearTimeout(timer);
    }
  }, [toast]);
  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);
  useEffect(() => {
    setTablePage(1);
  }, [query, status]);
  function navigate(next: Page) {
    setPage(next);
    setMobileNav(false);
    setQuery("");
    setTablePage(1);
    if (next !== "Verify a certificate" && window.location.search)
      window.history.replaceState({}, "", "/");
  }
  function openIssue() {
    if (session?.role === "admin") setIssue(true);
    else setLogin(true);
  }
  const filtered = certificates.filter(
    (c) =>
      (status === "All certificates" || c.status === status) &&
      `${c.recipient} ${c.course} ${c.id} ${c.email}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const activeCount = certificates.filter((c) => c.status === "Active").length;
  const expiring = certificates.filter(
    (c) =>
      c.status === "Active" &&
      c.expiresAt &&
      new Date(c.expiresAt).getTime() - Date.now() <= 30 * 86400000,
  ).length;
  const stats = [
    {
      label: "Total certificates",
      value: certificates.length,
      icon: Award,
      note: "Achievements recognized",
      color: "gray",
    },
    {
      label: "Active certificates",
      value: activeCount,
      icon: CircleCheck,
      note: "Valid and ready to verify",
      color: "green",
    },
    {
      label: "Expiring soon",
      value: expiring,
      icon: Clock3,
      note: "Within the next 30 days",
      color: "amber",
    },
    {
      label: "Revoked certificates",
      value: certificates.filter((c) => c.status === "Revoked").length,
      icon: Ban,
      note: "No longer valid",
      color: "gray",
    },
  ];
  return (
    <div className="app-shell">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      {mobileNav && (
        <button
          className="nav-scrim"
          aria-label="Close navigation"
          onClick={() => setMobileNav(false)}
        />
      )}
      <aside className={`sidebar ${mobileNav ? "open" : ""}`}>
        <div className="sidebar-brand">
          <Brand />
          <button
            className="icon-button mobile-only"
            aria-label="Close navigation"
            onClick={() => setMobileNav(false)}
          >
            <X size={19} />
          </button>
        </div>
        <button
          className="workspace-picker"
          onClick={() => navigate("Workspace")}
        >
          <span className="workspace-icon">
            <BookOpen size={17} />
          </span>
          <span>
            <strong>Credence Academy</strong>
            <small>Institution workspace</small>
          </span>
          <ChevronDown size={14} />
        </button>
        <div className="nav-label">WORKSPACE</div>
        <nav aria-label="Main navigation">
          {navigation.map(({ name, icon: Icon }) => (
            <button
              key={name}
              onClick={() => navigate(name)}
              className={page === name ? "active" : ""}
              aria-current={page === name ? "page" : undefined}
            >
              <Icon size={19} strokeWidth={1.7} />
              <span>{name}</span>
              {name === "Certificates" && (
                <span className="nav-count">{certificates.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="trust-card">
            <span className="trust-card-icon">
              <ShieldCheck size={22} strokeWidth={1.5} />
            </span>
            <h3>Trust in every credential.</h3>
            <p>
              Securely issued.
              <br />
              Instantly verifiable.
            </p>
            <button onClick={() => navigate("Verify a certificate")}>
              Explore verification
              <ArrowUpRight size={14} />
            </button>
          </div>
          <button
            className={`sidebar-settings ${page === "Workspace" ? "active" : ""}`}
            onClick={() => navigate("Workspace")}
          >
            <Settings2 size={18} />
            Workspace settings
          </button>
          <div className="profile">
            <span className="profile-avatar">
              {session?.role === "admin" ? "AD" : "GU"}
            </span>
            <span>
              <strong>
                {session?.role === "admin"
                  ? "Administrator"
                  : "Guest workspace"}
              </strong>
              <small>
                {session?.role === "admin" ? session.email : "Read-only access"}
              </small>
            </span>
            <button
              className="icon-button"
              aria-label={session?.role === "admin" ? "Sign out" : "Sign in"}
              onClick={async () => {
                if (session?.role === "admin") {
                  try {
                    await api("/logout", { method: "POST" });
                    await refresh();
                    setToast("You have been signed out.");
                  } catch (e) {
                    setToast((e as Error).message);
                  }
                } else setLogin(true);
              }}
            >
              {session?.role === "admin" ? (
                <LogOut size={17} />
              ) : (
                <ArrowRight size={17} />
              )}
            </button>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-only"
              aria-label="Open navigation"
              onClick={() => setMobileNav(true)}
            >
              <Menu size={21} />
            </button>
            <span>Workspace</span>
            <ChevronRight size={13} />
            <strong>{page}</strong>
          </div>
          <div className="topbar-right">
            <label className="global-search">
              <Search size={16} />
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage("Certificates");
                }}
                placeholder="Search certificates…"
                aria-label="Search certificates"
              />
              <kbd>
                <Command size={10} /> K
              </kbd>
            </label>
            <span className="topbar-divider" />
            <span className="workspace-status">
              <span />
              {session?.role === "admin" ? "Admin workspace" : "Demo workspace"}
            </span>
            <button
              className="icon-button help-button"
              aria-label="Workspace help"
              onClick={() => navigate("Workspace")}
            >
              <CircleHelp size={19} />
            </button>
          </div>
        </header>
        <main id="main-content">
          {error && (
            <div className="notice error" role="alert">
              {error}
              <button
                className="text-button"
                onClick={() => {
                  setLoading(true);
                  void refresh();
                }}
              >
                Retry
              </button>
            </div>
          )}
          {page === "Verify a certificate" ? (
            <Verification initialId={initialId} onDetail={setSelected} />
          ) : (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">YOUR CREDENTIAL WORKSPACE</div>
                  <h1>
                    {page === "Overview"
                      ? "A little clarity. A lot of confidence."
                      : page === "Certificates"
                        ? "Every achievement, in one place."
                        : page === "Activity"
                          ? "A clear record of every action."
                          : "Your workspace, considered."}
                  </h1>
                  <p>
                    {page === "Overview"
                      ? "Issue, manage, and verify credentials. All from one place."
                      : page === "Certificates"
                        ? "Manage the credentials that make your institution’s achievements official."
                        : page === "Activity"
                          ? "Follow the lifecycle of your institution’s digital credentials."
                          : "Everything you need to understand and manage your institution."}
                  </p>
                </div>
                {page !== "Workspace" && (
                  <button
                    className="button primary issue-button"
                    onClick={openIssue}
                  >
                    <Plus size={17} />
                    Issue certificate
                  </button>
                )}
              </div>
              {loading ? (
                <div className="loading-state" role="status">
                  <div className="loading-line" />
                  <p>Loading your workspace…</p>
                </div>
              ) : session && !session.demoMode && session.role !== "admin" ? (
                <div className="access-card">
                  <ShieldCheck size={35} />
                  <h2>Your institution’s workspace is private.</h2>
                  <p>
                    Sign in to manage certificates, or use public verification.
                  </p>
                  <button
                    className="button primary"
                    onClick={() => setLogin(true)}
                  >
                    Administrator sign in
                    <ArrowRight size={16} />
                  </button>
                </div>
              ) : (
                <>
                  {page === "Overview" && (
                    <>
                      <section
                        className="stats-grid"
                        aria-label="Certificate statistics"
                      >
                        {stats.map(
                          ({ label, value, icon: Icon, note, color }) => (
                            <div className={`stat-card ${color}`} key={label}>
                              <div>
                                <span>{label}</span>
                                <Icon size={18} strokeWidth={1.6} />
                              </div>
                              <strong>
                                {value.toString().padStart(2, "0")}
                              </strong>
                              <p>
                                {color === "green" && (
                                  <span className="mini-dot" />
                                )}
                                {note}
                              </p>
                            </div>
                          ),
                        )}
                      </section>
                      <section className="overview-middle">
                        <div className="hero-card">
                          <div className="hero-content">
                            <span className="eyebrow">
                              <span className="mini-dot" /> MADE FOR MEANINGFUL
                              MILESTONES
                            </span>
                            <h2>
                              Great achievements
                              <br />
                              deserve trusted credentials.
                            </h2>
                            <p>
                              Give every accomplishment a lasting identity.
                              <br />
                              Beautifully simple. Secure by design.
                            </p>
                            <button
                              className="button hero-button"
                              onClick={openIssue}
                            >
                              Create a certificate
                              <ArrowUpRight size={16} />
                            </button>
                          </div>
                          <div className="certificate-art" aria-hidden="true">
                            <div className="art-card back" />
                            <div className="art-card front">
                              <div className="art-header">
                                <ShieldCheck size={13} />
                                <span>CREDENCE</span>
                                <span>✧</span>
                              </div>
                              <div className="art-award">
                                <Award size={33} strokeWidth={1.1} />
                              </div>
                              <div className="art-eyebrow">
                                CERTIFICATE OF ACHIEVEMENT
                              </div>
                              <div className="art-name">
                                A well-earned moment.
                              </div>
                              <div className="art-line long" />
                              <div className="art-line short" />
                              <div className="art-footer">
                                <span>Credence Academy</span>
                                <div className="art-seal">
                                  <Check size={14} />
                                </div>
                              </div>
                            </div>
                            <div className="art-verified">
                              <span>
                                <ShieldCheck size={15} />
                              </span>
                              Signed. Secured.
                            </div>
                            <span className="art-star one">✧</span>
                            <span className="art-star two">✦</span>
                          </div>
                        </div>
                        <div className="quick-verify">
                          <div className="quick-icon">
                            <ShieldCheck size={24} strokeWidth={1.5} />
                            <ArrowUpRight size={15} />
                          </div>
                          <h3>Confidence, in a click.</h3>
                          <p>
                            Check a certificate’s authenticity
                            <br />
                            with its unique credential ID.
                          </p>
                          <form
                            onSubmit={(e) => {
                              e.preventDefault();
                              const value = new FormData(e.currentTarget).get(
                                "id",
                              ) as string;
                              window.history.replaceState(
                                {},
                                "",
                                `/?verify=${encodeURIComponent(value.trim())}`,
                              );
                              setPage("Verify a certificate");
                            }}
                          >
                            <label className="sr-only" htmlFor="quick-id">
                              Credential ID
                            </label>
                            <input
                              id="quick-id"
                              name="id"
                              required
                              maxLength={30}
                              placeholder="Enter certificate ID"
                            />
                            <button className="button secondary full">
                              Verify a certificate
                              <ArrowRight size={15} />
                            </button>
                          </form>
                          <span className="quick-caption">
                            <ShieldCheck size={12} />
                            No account needed to verify
                          </span>
                        </div>
                      </section>
                      <section className="registry-card">
                        <div className="section-heading">
                          <div>
                            <h2>
                              Recent certificates{" "}
                              <span>{certificates.length}</span>
                            </h2>
                            <p>A look at your latest issued credentials.</p>
                          </div>
                          <button
                            className="text-button"
                            onClick={() => navigate("Certificates")}
                          >
                            View all certificates
                            <ArrowRight size={15} />
                          </button>
                        </div>
                        {certificates.length ? (
                          <CertificateTable
                            rows={certificates.slice(0, 5)}
                            onSelect={setSelected}
                          />
                        ) : (
                          <Empty
                            title="A fresh start"
                            text="Issue your first certificate to recognize an achievement."
                          />
                        )}
                        <div className="table-footer">
                          <TrustNote>
                            Every certificate has a unique, verifiable identity
                          </TrustNote>
                          <span>
                            Showing {Math.min(5, certificates.length)} of{" "}
                            {certificates.length}
                          </span>
                        </div>
                      </section>
                      <div className="bottom-note">
                        <ShieldCheck size={14} />
                        <span>Built on trust. Designed for simplicity.</span>
                        <span className="note-separator">·</span>
                        <span>Your achievements, made official.</span>
                      </div>
                    </>
                  )}
                  {page === "Certificates" && (
                    <section className="registry-card registry-full">
                      <div className="registry-controls">
                        <div
                          className="filter-tabs"
                          role="group"
                          aria-label="Filter certificate status"
                        >
                          {[
                            "All certificates",
                            "Active",
                            "Expired",
                            "Revoked",
                          ].map((s) => (
                            <button
                              key={s}
                              aria-pressed={status === s}
                              className={status === s ? "selected" : ""}
                              onClick={() => setStatus(s)}
                            >
                              {s}
                              {s === "All certificates" && (
                                <span>{certificates.length}</span>
                              )}
                            </button>
                          ))}
                        </div>
                        <button
                          className="button secondary"
                          onClick={() => {
                            exportCsv(filtered);
                            setToast(
                              `${filtered.length} certificates exported.`,
                            );
                          }}
                        >
                          <Download size={15} />
                          Export CSV
                        </button>
                      </div>
                      <div className="registry-search">
                        <Search size={17} />
                        <input
                          aria-label="Filter by name, course or ID"
                          placeholder="Search by name, course, or certificate ID…"
                          value={query}
                          onChange={(e) => setQuery(e.target.value)}
                        />
                        <span>{filtered.length} results</span>
                      </div>
                      {filtered.length ? (
                        <CertificateTable
                          rows={filtered.slice(
                            (tablePage - 1) * 8,
                            tablePage * 8,
                          )}
                          onSelect={setSelected}
                        />
                      ) : (
                        <Empty
                          title="No certificates found"
                          text="Try another search or choose a different status."
                        />
                      )}
                      <div className="table-footer">
                        <span>
                          Showing{" "}
                          {filtered.length ? (tablePage - 1) * 8 + 1 : 0}–
                          {Math.min(tablePage * 8, filtered.length)} of{" "}
                          {filtered.length} certificates
                        </span>
                        <div className="pagination">
                          <button
                            className="icon-button"
                            aria-label="Previous page"
                            disabled={tablePage === 1}
                            onClick={() => setTablePage((p) => p - 1)}
                          >
                            <ChevronLeft size={17} />
                          </button>
                          <span>
                            {tablePage} /{" "}
                            {Math.max(1, Math.ceil(filtered.length / 8))}
                          </span>
                          <button
                            className="icon-button"
                            aria-label="Next page"
                            disabled={tablePage * 8 >= filtered.length}
                            onClick={() => setTablePage((p) => p + 1)}
                          >
                            <ChevronRight size={17} />
                          </button>
                        </div>
                      </div>
                    </section>
                  )}
                  {page === "Activity" && (
                    <section className="activity-card">
                      <div className="section-heading">
                        <div>
                          <h2>Workspace activity</h2>
                          <p>The latest 100 events, newest first.</p>
                        </div>
                        <span className="subtle-chip">Audit trail</span>
                      </div>
                      {activity.length ? (
                        <div className="activity-list">
                          {activity.map((event) => (
                            <div key={event.id} className="activity-row">
                              <span
                                className={`event-icon ${event.action === "Revoked" ? "revoked" : ""}`}
                              >
                                {event.action === "Revoked" ? (
                                  <Ban size={19} />
                                ) : (
                                  <FileCheck2 size={19} />
                                )}
                              </span>
                              <div>
                                <h3>{event.detail}</h3>
                                <button
                                  className="text-button mono"
                                  onClick={() =>
                                    setSelected(
                                      certificates.find(
                                        (c) => c.id === event.certificateId,
                                      ) || null,
                                    )
                                  }
                                >
                                  {event.certificateId}
                                  <ArrowUpRight size={12} />
                                </button>
                              </div>
                              <time dateTime={event.createdAt}>
                                {dateLabel(event.createdAt)}
                                <small>
                                  {new Date(event.createdAt).toLocaleTimeString(
                                    [],
                                    { hour: "2-digit", minute: "2-digit" },
                                  )}
                                </small>
                              </time>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <Empty
                          title="Your story starts here"
                          text="Certificate issuance and revocation will appear here."
                        />
                      )}
                    </section>
                  )}
                  {page === "Workspace" && (
                    <div className="settings-grid">
                      <section className="settings-card">
                        <div className="settings-icon">
                          <BookOpen size={24} />
                        </div>
                        <h2>Credence Academy</h2>
                        <p>
                          A single, trusted home for your institution’s digital
                          credentials.
                        </p>
                        <dl>
                          <div>
                            <dt>Workspace</dt>
                            <dd>
                              {session?.role === "admin"
                                ? "Administrator"
                                : "Read-only demonstration"}
                            </dd>
                          </div>
                          <div>
                            <dt>Certificate registry</dt>
                            <dd>{certificates.length} credentials</dd>
                          </div>
                          <div>
                            <dt>Verification</dt>
                            <dd>
                              <Badge status="Active" />
                            </dd>
                          </div>
                          <div>
                            <dt>Storage</dt>
                            <dd>Local SQLite database</dd>
                          </div>
                        </dl>
                      </section>
                      <section className="settings-card">
                        <div className="settings-icon">
                          <ShieldCheck size={24} />
                        </div>
                        <h2>Simple by design. Secure by default.</h2>
                        <p>
                          Certificates receive a unique ID and a
                          server-generated integrity signature. Public
                          verification always checks the current record.
                        </p>
                        <ul>
                          <li>
                            Administrator sign-in is required to issue or
                            revoke.
                          </li>
                          <li>
                            Recipient email addresses stay off public
                            verification pages.
                          </li>
                          <li>
                            QR codes link directly to the verification result.
                          </li>
                          <li>
                            Expired and revoked credentials remain traceable.
                          </li>
                        </ul>
                        <div className="notice">
                          {session?.configured
                            ? "Administrator access is configured for this workspace."
                            : "To enable issuing, follow the administrator setup instructions in README.md. No default password is used."}
                        </div>
                        <button
                          className="button secondary"
                          onClick={() =>
                            session?.role === "admin"
                              ? navigate("Certificates")
                              : setLogin(true)
                          }
                        >
                          {session?.role === "admin"
                            ? "Manage certificates"
                            : "Administrator sign in"}
                          <ArrowRight size={16} />
                        </button>
                      </section>
                      <section className="settings-card settings-wide">
                        <h2>Try the complete verification flow</h2>
                        <p>
                          Open a sample certificate, copy its verification link,
                          or scan its QR code. Use your browser’s print dialog
                          to save a certificate as a PDF.
                        </p>
                        <button
                          className="text-button"
                          onClick={() => navigate("Certificates")}
                        >
                          Explore the certificate registry
                          <ArrowRight size={15} />
                        </button>
                      </section>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </main>
        <footer className="app-footer">
          <span>© {new Date().getFullYear()} Credence</span>
          <span>Digital credentials. Human achievements.</span>
          <span className="footer-system">
            <span />
            All systems local
          </span>
        </footer>
      </div>
      {login && (
        <LoginForm
          session={session}
          onClose={() => setLogin(false)}
          onSuccess={() => {
            setLogin(false);
            void refresh();
            setToast("Welcome back. Your workspace is ready.");
          }}
        />
      )}
      {issue && (
        <IssueForm
          onClose={() => setIssue(false)}
          onSuccess={(c) => {
            setIssue(false);
            setSelected(c);
            void refresh();
            setToast("Certificate issued successfully.");
          }}
        />
      )}
      {selected && (
        <CertificateDetail
          certificate={selected}
          admin={session?.role === "admin"}
          onClose={() => setSelected(null)}
          onChanged={() => void refresh()}
          notify={setToast}
        />
      )}
      {toast && (
        <div className="toast" role="status">
          <CircleCheck size={18} />
          {toast}
          <button
            className="icon-button"
            aria-label="Dismiss notification"
            onClick={() => setToast("")}
          >
            <X size={15} />
          </button>
        </div>
      )}
    </div>
  );
}
