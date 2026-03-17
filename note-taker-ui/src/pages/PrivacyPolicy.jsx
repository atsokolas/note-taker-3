import React from 'react';
import { Link } from 'react-router-dom';
import { Card } from '../components/ui';

const PrivacyPolicy = () => (
  <div className="legal-shell">
    <Card className="legal-card">
      <p className="legal-eyebrow">Legal</p>
      <h1>Privacy Policy</h1>
      <p className="muted">Last updated: March 17, 2026</p>
      <p>
        Note Taker stores the information you choose to add so you can capture, organize, search, and revisit your
        reading and notes. This page is a product-facing policy starter and should be reviewed before being treated as
        final legal copy.
      </p>
    </Card>

    <Card className="legal-card">
      <h2>What We Collect</h2>
      <p>We may collect account information such as your username, authentication data, and the content you save in the product.</p>
      <p>That can include articles, highlights, notebook entries, concepts, tags, imports, and integration metadata needed to run those features.</p>
    </Card>

    <Card className="legal-card">
      <h2>How We Use It</h2>
      <p>We use your data to provide the core product experience, including storage, retrieval, search, resurfacing, exports, and connected-import workflows.</p>
      <p>If AI-powered features are enabled, the relevant saved content may be processed to generate summaries, embeddings, retrieval results, or other product responses.</p>
    </Card>

    <Card className="legal-card">
      <h2>Integrations</h2>
      <p>When you connect third-party services such as Notion, Readwise, or Evernote, we store the minimum credentials and metadata needed to maintain that connection.</p>
      <p>Imported content is mapped into your workspace so it can be searched, organized, and used in product workflows.</p>
    </Card>

    <Card className="legal-card">
      <h2>Sharing and Retention</h2>
      <p>We do not sell your personal data. We may use service providers that host infrastructure, analytics, or product functionality on our behalf.</p>
      <p>Your data is retained while your account is active unless you delete content or request deletion where supported.</p>
    </Card>

    <Card className="legal-card">
      <h2>Your Choices</h2>
      <p>You can disconnect integrations, export your content where supported, and remove saved material from the product.</p>
      <p>If you need changes to this policy or a contact method added, update this page before publishing it as final legal text.</p>
    </Card>

    <div className="legal-links">
      <Link to="/terms">Terms of Use</Link>
      <Link to="/">Back to home</Link>
    </div>
  </div>
);

export default PrivacyPolicy;
