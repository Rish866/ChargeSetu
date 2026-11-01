/**
 * English UI strings. To add Hindi or Marathi, copy this file to `hi.ts` /
 * `mr.ts`, translate the values (keep the keys), and register it in
 * `src/lib/i18n/index.ts`. TypeScript will flag any missing keys.
 */
export const en = {
  brand: {
    name: "ChargeSetu",
    tagline: "Find EV charging stations across India",
  },
  nav: {
    home: "Home",
    stations: "Find stations",
    about: "How we verify",
    report: "Report an issue",
    operator: "For operators",
    admin: "Admin",
    signIn: "Sign in",
    signOut: "Sign out",
    account: "Account",
  },
  demo: {
    banner:
      "Demo mode — every station shown is fictional sample data, not real charging infrastructure.",
    learnMore: "Learn more",
    label: "Demo data",
  },
  home: {
    heroTitle: "Charge with confidence, anywhere in India",
    heroSubtitle:
      "Search charging stations by city, area, connector and charging speed. Listings come from charge point operators and are reviewed before they go live.",
    searchPlaceholder: "Search city, area or station name",
    searchButton: "Search",
    nearMe: "Stations near me",
    locating: "Finding your location…",
    locationDenied:
      "We couldn't access your location. You can still search by city or area.",
    popularAreas: "Popular areas",
    featured: "Recently verified stations",
    operatorCtaTitle: "Run charging stations?",
    operatorCtaBody:
      "List your stations for free. Our team reviews every submission before it is published.",
    operatorCtaButton: "List your stations",
    reportCtaTitle: "Spotted something wrong?",
    reportCtaBody:
      "Help other drivers by reporting outdated prices, hours or closed stations.",
    reportCtaButton: "Report an issue",
  },
  stations: {
    title: "Charging stations",
    resultsCount: (n: number) =>
      n === 1 ? "1 station found" : `${n} stations found`,
    listView: "List",
    mapView: "Map",
    noResultsTitle: "No stations match your filters",
    noResultsBody: "Try a different city, connector or a lower power filter.",
    clearFilters: "Clear filters",
    directions: "Directions",
    details: "View details",
    distanceAway: (km: string) => `${km} km away`,
    priceNotVerified: "Price not yet verified",
    free: "Free",
    availabilityNotConnected: "Availability not connected",
    availabilityHelp:
      "We don't receive live charger status yet. Check with the operator before you travel.",
    lastUpdated: "Updated",
    lastVerified: "Verified",
    connectors: "Connectors",
    power: "Max power",
    price: "Price",
    hours: "Opening hours",
    amenities: "Amenities",
    contact: "Contact",
    photos: "Photos",
    reportIssue: "Report incorrect information",
    backToList: "Back to stations",
    mapUnavailable:
      "The map couldn't be loaded. All stations are still listed below.",
    mapDisabled: "Map view is turned off. Showing the list instead.",
  },
  filters: {
    title: "Filters",
    search: "Search",
    city: "City",
    anyCity: "All cities",
    connector: "Connector",
    anyConnector: "Any connector",
    power: "Charging power",
    network: "Network / operator",
    anyNetwork: "All networks",
    apply: "Apply filters",
    reset: "Reset",
  },
  verification: {
    verified: "Verified",
    unverified: "Not yet verified",
    verifiedHelp: "Details confirmed by our review team.",
    unverifiedHelp:
      "Approved for listing, but details have not been independently confirmed.",
  },
  status: {
    pending_review: "Pending review",
    published: "Published",
    rejected: "Rejected",
    inactive: "Inactive",
  },
  report: {
    title: "Report incorrect information",
    subtitle:
      "Tell us what's wrong and our team will review it. Reports are not shared publicly.",
    station: "Station",
    chooseStation: "Choose a station",
    issueType: "What's wrong?",
    chooseIssue: "Choose an issue",
    description: "Details",
    descriptionHint: "What did you see? Include the correct details if you know them.",
    email: "Your email (optional)",
    emailHint: "Only used if we need to follow up.",
    submit: "Send report",
    success: "Thanks! Your report has been sent to our review team.",
  },
  operator: {
    title: "Operator dashboard",
    newStation: "Submit a station",
    editStation: "Edit station",
    yourStations: "Your stations",
    empty: "You haven't submitted any stations yet.",
    reviewNote:
      "New stations and edits are reviewed by our team before they appear publicly.",
    submitted:
      "Station submitted. It's now pending review and will be visible once approved.",
    updated: "Changes saved. The station is back in review and will reappear once approved.",
  },
  admin: {
    title: "Admin",
    pending: "Pending submissions",
    reports: "User reports",
    allStations: "All stations",
    approve: "Approve",
    approveVerify: "Approve & verify",
    reject: "Reject",
    verify: "Mark verified",
    deactivate: "Deactivate",
    reactivate: "Re-publish",
    edit: "Edit",
    resolve: "Resolve",
    dismiss: "Dismiss",
    noPending: "No submissions waiting for review.",
    noReports: "No open reports.",
  },
  common: {
    loading: "Loading…",
    save: "Save",
    cancel: "Cancel",
    saving: "Saving…",
    sending: "Sending…",
    required: "Required",
    optional: "optional",
    tryAgain: "Try again",
    goHome: "Go to home page",
  },
} as const;

type Widen<T> = T extends (...args: infer A) => infer R
  ? (...args: A) => R
  : T extends string
    ? string
    : { [K in keyof T]: Widen<T[K]> };

export type Messages = Widen<typeof en>;
