import React from 'react';
import { Link } from 'react-router-dom';
import { Card } from '../components/ui';
import useSeoMetadata from '../hooks/useSeoMetadata';

const TermsOfUse = () => {
  useSeoMetadata({
    title: 'Terms of Use | Noeis',
    description: 'Read the current terms of use for Noeis, the concept-centered thinking workspace for serious readers.',
    canonicalPath: '/terms',
    ogType: 'website'
  });

  return (
    <div className="legal-shell">
      <Card className="legal-card">
        <p className="legal-eyebrow">Legal</p>
        <h1>Terms of Use</h1>
        <p className="muted">Last updated: March 17, 2026</p>
        <p>
          These terms govern access to and use of Noeis. This page is a product-facing terms starter and should be
          reviewed before being treated as final legal text.
        </p>
      </Card>

      <Card className="legal-card">
        <h2>Using the Service</h2>
        <p>You may use Noeis to capture, import, organize, search, and revisit your own reading, notes, and related material.</p>
        <p>You are responsible for the content you upload, import, connect, or create in the service.</p>
      </Card>

      <Card className="legal-card">
        <h2>Accounts and Security</h2>
        <p>You are responsible for maintaining the confidentiality of your account credentials and for activity that occurs under your account.</p>
        <p>You should not use the service in a way that violates applicable law or the rights of others.</p>
      </Card>

      <Card className="legal-card">
        <h2>Third-Party Services</h2>
        <p>The product may connect to third-party services such as Notion, Readwise, or Evernote. Your use of those services remains subject to their own terms and policies.</p>
        <p>We are not responsible for downtime, API changes, or content restrictions imposed by third-party providers.</p>
      </Card>

      <Card className="legal-card">
        <h2>AI Features</h2>
        <p>AI-assisted features may generate suggestions, summaries, or related outputs. Those outputs may be incomplete or inaccurate and should be reviewed by you before reliance.</p>
      </Card>

      <Card className="legal-card">
        <h2>Availability and Changes</h2>
        <p>We may update, suspend, or remove parts of the service over time. We may also revise these terms by updating this page.</p>
      </Card>

      <Card className="legal-card">
        <h2>Disclaimer</h2>
        <p>The service is provided on an “as is” and “as available” basis to the extent permitted by law.</p>
      </Card>

      <div className="legal-links">
        <Link to="/privacy">Privacy Policy</Link>
        <Link to="/">Back to home</Link>
      </div>
    </div>
  );
};

export default TermsOfUse;
