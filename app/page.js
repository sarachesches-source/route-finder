// Landing page (/). Explains Hillgorithm in five seconds and sends people to /plan.
// Psychology behind it (see CLAUDE.md "Landing page"): clarity first, show real results,
// no account needed, runners' own language, honest about limits.
import Link from 'next/link';
import './landing.css';
import {
  LogoIcon, PinIcon, MountainIcon, DropIcon, FlagIcon, CheckIcon, DownloadIcon, ChevronIcon,
} from './icons';

export const metadata = {
  title: 'Hillgorithm · Loops built to your climb',
  description: 'Tell us the distance and the climb. Get real trail loops that hit both, with surfaces, water stops and bail-outs. Free, no subscription.',
  openGraph: {
    title: 'Hillgorithm · Loops built to your climb',
    description: 'Tell us the distance and the climb. Get the loop.',
    images: ['/landing/results.png'],
  },
};

const STEPS = [
  { icon: PinIcon, title: 'Set your start', text: 'Click the map, type coordinates, or use your location.' },
  { icon: MountainIcon, title: 'Pick distance and climb', text: 'For example 15 km with 500 m of vert. Add a race if you are training for one.' },
  { icon: DownloadIcon, title: 'Get three real loops', text: 'Ranked on how close they get, with GPX for any watch.' },
];

const FEATURES = [
  { icon: MountainIcon, title: 'Your climb, not "hilly-ish"', text: 'Every loop is measured against your distance and your metres of climbing. You see the miss in plain numbers: +1%, −4%.' },
  { icon: PinIcon, title: 'Trail, not traffic', text: 'See how much is trail, gravel or road before you go. Among equally good loops, the one with more trail wins.' },
  { icon: DropIcon, title: 'Water and bail-outs', text: 'Fountains and springs along the way, the longest dry stretch, and how far from home you are at every point.' },
  { icon: FlagIcon, title: 'Race rehearsal', text: 'Upload a race GPX and get local loops with its climbs, descents and steepness in the same places.' },
];

const TRUST = [
  { title: 'Real paths', text: 'Routes come from OpenStreetMap through a proper routing engine. The AI never draws your route.' },
  { title: 'Explained, not magic', text: 'Every result says why it ranks where it does, and warns you about steep or risky stretches.' },
  { title: 'Honest about limits', text: 'If your area can’t give you 500 m in 15 km, you’ll see the real miss instead of a pretty lie.' },
];

const FAQ = [
  ['Is it free?', 'Yes. No subscription, no trial, no card. To keep it free for everyone, each visitor gets a few fresh searches per hour.'],
  ['Where does it work?', 'Anywhere trails are mapped in OpenStreetMap, including Europe and North America. Switch between kilometres and miles in the planner.'],
  ['How long does a search take?', 'Up to about two minutes for a brand-new search, because it checks around 24 candidate loops. Repeated searches are instant.'],
  ['Can I use the routes on my watch?', 'Yes. Download any loop as a GPX file and import it into Garmin, COROS, Suunto, Apple Watch apps and most others.'],
  ['Do I need an account?', 'No. Everything works without one. Accounts are coming soon for saving routes and races.'],
  ['What happens to my data?', 'There are no accounts and no tracking. Your start point is sent to the routing service to find paths, and searches are counted for an hour under a scrambled code, never your address.'],
];

export default function Landing() {
  return (
    <div className="landing">
      <header className="l-nav">
        <Link href="/" className="l-logo" aria-label="Hillgorithm home">
          <span className="brand-mark"><LogoIcon size={18} /></span>Hillgorithm
        </Link>
        <nav className="l-links" aria-label="Sections">
          <a href="#how">How it works</a>
          <a href="#features">What you get</a>
          <a href="#faq">Questions</a>
        </nav>
        <div className="l-nav-actions">
          <a className="l-signin" href="#accounts">Sign in</a>
          <Link className="btn btn-primary l-nav-cta" href="/plan">Try it free</Link>
        </div>
      </header>

      <main>
        {/* Hero: one message, one action, proof on the right */}
        <section className="l-hero">
          <div className="l-hero-copy">
            <span className="l-tag">Free · no subscription</span>
            <h1>Tell us the distance and the climb. Get the loop.</h1>
            <p className="l-lead">
              Real trail loops from OpenStreetMap that hit your kilometres and your vert, with surfaces,
              water stops and bail-outs.
            </p>
            <div className="l-ctas">
              <Link className="btn btn-primary l-cta" href="/plan">Try it free <ChevronIcon size={16} /></Link>
              <span className="l-cta-note">No account needed</span>
            </div>
            <ol className="l-steps-inline">
              <li><span>1</span>Set your start</li>
              <li><span>2</span>Pick km and vert</li>
              <li><span>3</span>Get 3 loops</li>
            </ol>
          </div>

          <div className="l-hero-visual" aria-label="A loop on a contour map: 15.1 km with 504 m of climbing, 53% trail">
            <svg viewBox="0 0 420 300" className="l-map" role="img" aria-hidden="true">
              <rect width="420" height="300" className="l-map-bg" />
              <g className="l-contours">
                <path d="M-10 250 Q80 205 170 228 T430 190" />
                <path d="M-10 214 Q90 170 180 190 T430 150" />
                <path d="M-10 178 Q100 135 190 152 T430 112" />
                <path d="M30 140 Q130 92 220 112 T430 76" />
                <path d="M90 104 Q180 58 260 74 T430 44" />
                <path d="M150 70 Q220 32 300 44" />
                <path d="M200 46 Q250 22 300 26" />
              </g>
              <path className="l-loop" pathLength="1"
                d="M96 236 C80 176 128 132 178 116 C228 100 286 88 314 128 C342 168 306 224 252 238 C208 250 160 256 124 250 Z" />
              <circle cx="96" cy="236" r="7" className="l-start" />
              <circle cx="292" cy="98" r="5.5" className="l-water" />
            </svg>
            <div className="l-stat">
              <div><strong>15.1 km</strong><span className="pill good">+1%</span></div>
              <div><strong>504 m ↑</strong><span className="pill good">+1%</span></div>
              <div className="l-stat-meta">53% trail · 1 water stop · run clockwise</div>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className="l-section" id="how">
          <h2>Three steps, about two minutes</h2>
          <div className="l-grid-3">
            {STEPS.map(({ icon: Icon, title, text }, i) => (
              <div className="card card-pad l-step" key={title}>
                <span className="l-step-num">{i + 1}</span>
                <span className="l-icon"><Icon size={20} /></span>
                <h3>{title}</h3>
                <p>{text}</p>
              </div>
            ))}
          </div>
        </section>

        {/* What you get, as outcomes */}
        <section className="l-section" id="features">
          <h2>What you get</h2>
          <p className="l-section-lead">Built for trail and ultra runners who care about the vert, not just the kilometres.</p>
          <div className="l-grid-2">
            {FEATURES.map(({ icon: Icon, title, text }) => (
              <div className="card card-pad l-feature" key={title}>
                <span className="l-icon"><Icon size={20} /></span>
                <div>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Show real results */}
        <section className="l-section">
          <h2>Real results, explained</h2>
          <p className="l-section-lead">A real search from the edge of the Făget forest in Cluj-Napoca: 15 km with 500 m of climbing.</p>
          <figure className="l-shot">
            <img src="/landing/results.png" alt="Three loop results with distance, climbing and surface bars next to a topo map coloured by surface" width="1600" height="1000" loading="lazy" />
          </figure>
          <div className="l-grid-2 l-shots-2">
            <figure className="l-shot">
              <img src="/landing/why.png" alt="The Why this route card: closest to your targets, steep climb and descent warnings" width="1600" height="1000" loading="lazy" />
              <figcaption>Every result explains itself and warns you about steep stretches.</figcaption>
            </figure>
            <figure className="l-shot">
              <img src="/landing/race.png" alt="Race rehearsal of a mountain marathon with matched local loops" width="1600" height="1000" loading="lazy" />
              <figcaption>Race rehearsal: a mountain marathon’s pattern on local trails.</figcaption>
            </figure>
          </div>
        </section>

        {/* Trust */}
        <section className="l-section">
          <h2>Why you can trust it</h2>
          <div className="l-grid-3">
            {TRUST.map(({ title, text }) => (
              <div className="l-trust" key={title}>
                <span className="l-check"><CheckIcon size={14} strokeWidth={3} /></span>
                <div>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Accounts: honest "coming soon" */}
        <section className="l-section" id="accounts">
          <div className="card card-pad l-accounts">
            <div>
              <span className="l-tag">Coming soon</span>
              <h2>Accounts</h2>
              <p>Everything works without an account today. Soon, signing in will let you:</p>
              <ul>
                <li><CheckIcon size={14} /> Save your favourite loops and races</li>
                <li><CheckIcon size={14} /> Run more searches per hour</li>
                <li><CheckIcon size={14} /> Prefer paths you haven’t run yet</li>
              </ul>
            </div>
            <Link className="btn btn-primary l-cta" href="/plan">Try it free now <ChevronIcon size={16} /></Link>
          </div>
        </section>

        {/* FAQ */}
        <section className="l-section" id="faq">
          <h2>Questions</h2>
          <div className="l-faq">
            {FAQ.map(([q, a]) => (
              <details key={q}>
                <summary>{q}<ChevronIcon size={16} /></summary>
                <p>{a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* Final call to action */}
        <section className="l-final">
          <span className="brand-mark l-final-mark"><LogoIcon size={22} /></span>
          <h2>Your next loop is two minutes away</h2>
          <p>Set a start point, pick your distance and climb, and go.</p>
          <Link className="btn btn-primary l-cta" href="/plan">Find your loop <ChevronIcon size={16} /></Link>
        </section>
      </main>

      <footer className="l-footer">
        <span>Hillgorithm · Loops built to your climb</span>
        <span>
          Map data © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors ·
          Routing by <a href="https://openrouteservice.org/">openrouteservice</a> ·
          Tiles by <a href="https://opentopomap.org/">OpenTopoMap</a>
        </span>
      </footer>
    </div>
  );
}
