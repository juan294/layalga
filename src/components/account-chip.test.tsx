import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import en from "../../messages/en.json";
import es from "../../messages/es.json";
import { AccountChip } from "./account-chip";

const identity = {
  email: "ana@example.com",
  avatarUrl: "https://lh3.googleusercontent.com/a/photo=s96-c",
  initial: "A",
};

describe("AccountChip", () => {
  it("renders nothing without an identity", () => {
    expect(
      renderToStaticMarkup(
        <AccountChip identity={null} label={en.Brand.signedInAs} />,
      ),
    ).toBe("");
  });

  it("shows the email, the monogram, the hidden label and the full address as title", () => {
    const html = renderToStaticMarkup(
      <AccountChip identity={identity} label={en.Brand.signedInAs} />,
    );

    expect(html).toContain('data-testid="account-chip"');
    expect(html).toContain('title="ana@example.com"');
    expect(html).toContain(">ana@example.com<");
    expect(html).toContain(">A<");
    expect(html).toMatch(
      /class="[^"]*site-header__account-label[^"]*"[^>]*>Signed in as</,
    );
  });

  it("loads the avatar without a referrer and with an empty alt", () => {
    const html = renderToStaticMarkup(
      <AccountChip identity={identity} label={en.Brand.signedInAs} />,
    );

    expect(html).toContain(
      'src="https://lh3.googleusercontent.com/a/photo=s96-c"',
    );
    expect(html).toContain('referrerPolicy="no-referrer"');
    expect(html).toMatch(/<img[^>]*alt=""/);
  });

  it("renders only the monogram when there is no avatar", () => {
    const html = renderToStaticMarkup(
      <AccountChip
        identity={{ ...identity, avatarUrl: null }}
        label={en.Brand.signedInAs}
      />,
    );

    expect(html).not.toContain("<img");
    expect(html).toContain(">A<");
  });

  it("hides the decorative avatar from assistive technology", () => {
    const html = renderToStaticMarkup(
      <AccountChip identity={identity} label={en.Brand.signedInAs} />,
    );

    expect(html).toMatch(
      /<span[^>]*aria-hidden="true"[^>]*class="site-header__account-avatar"|<span[^>]*class="site-header__account-avatar"[^>]*aria-hidden="true"/,
    );
    expect(html).not.toMatch(
      /class="site-header__account-email"[^>]*aria-hidden/,
    );
  });

  it("renders the label it is given, in each locale", () => {
    expect(en.Brand.signedInAs).not.toBe(es.Brand.signedInAs);
    for (const label of [en.Brand.signedInAs, es.Brand.signedInAs]) {
      expect(
        renderToStaticMarkup(<AccountChip identity={identity} label={label} />),
      ).toContain(`>${label}<`);
    }
  });
});
