import type { Platform } from "../shared/accounts";
import type { Channel, Donation } from "../shared/api";
import { shortUrl } from "./format";
import { PLATFORMS } from "./platforms";
import type { LinkItem } from "./types";

export function followLink(platform: Platform, account: string, channel: Channel): LinkItem {
  const ui = PLATFORMS[platform];
  const href = ui.followUrl(account, channel.url);
  return { label: ui.follow, text: shortUrl(href.split("?")[0] ?? href), href };
}

export const donationLinks = (donations: Donation[]): LinkItem[] =>
  donations.map((d) => ({ label: "贊助主播", text: shortUrl(d.url), href: d.url }));

/** A page on this site, shown with the site's own host. */
export const siteLink = (label: string, path: string): LinkItem => ({
  label,
  to: path,
  text: shortUrl(`${window.location.host}${path}`),
});
