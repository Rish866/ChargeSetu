import type { Metadata } from "next";
import { Card, CardBody } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";

export const metadata: Metadata = {
  title: "Open data & sources",
  description: "Where ChargeSetu station data comes from, its licence, and how to download it.",
};

const REPO = "https://github.com/Rish866/ChargeSetu";
const RAW = "https://raw.githubusercontent.com/Rish866/ChargeSetu/main";

export default function OpenDataPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="Open data & sources" description="Where our station information comes from, and how you can reuse it." />

      <Card>
        <CardBody className="space-y-3 text-sm leading-relaxed">
          <h2 className="text-lg font-semibold">Stations from OpenStreetMap</h2>
          <p>
            Most public stations on ChargeSetu come from{" "}
            <a className="font-medium text-brand-700 underline" href="https://www.openstreetmap.org/">OpenStreetMap</a>, a map of the world
            made by volunteers. This data is © OpenStreetMap contributors and is available under the{" "}
            <a className="font-medium text-brand-700 underline" href="https://opendatacommons.org/licenses/odbl/1-0/">
              Open Database License (ODbL) 1.0
            </a>
            . Addresses that were not mapped are approximated from the map position using OpenStreetMap&apos;s Nominatim service.
          </p>
          <p>
            These stations are labelled <strong>“Source-listed · status unconfirmed”</strong>. We have not checked that each charger works,
            is open to the public, or that its details are current. We never show live availability.
          </p>
          <p>
            As the ODbL requires, the station database we derived from OpenStreetMap is offered under the same licence:
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li><a className="text-brand-700 underline" href={`${RAW}/data/osm/india-osm-charging-stations.csv`}>india-osm-charging-stations.csv</a> (CSV)</li>
            <li><a className="text-brand-700 underline" href={`${RAW}/data/osm/india-osm-charging-stations.json`}>india-osm-charging-stations.json</a> (JSON, as imported)</li>
            <li><a className="text-brand-700 underline" href={`${RAW}/data/osm/excluded.csv`}>excluded.csv</a> (records we left out, with reasons)</li>
            <li><a className="text-brand-700 underline" href={`${REPO}/blob/main/scripts/etl/build-osm-publish.mts`}>How the data is processed</a></li>
          </ul>
          <p>
            Found a mistake? Fix it on <a className="text-brand-700 underline" href="https://www.openstreetmap.org/">OpenStreetMap</a> for
            everyone, or use “Report incorrect information” on the station page.
          </p>
        </CardBody>
      </Card>

      <Card>
        <CardBody className="space-y-3 text-sm leading-relaxed">
          <h2 className="text-lg font-semibold">Stations from operators</h2>
          <p>
            Charge point operators can submit and claim their stations. Our team reviews each submission. Stations whose details were
            confirmed by the operator or our team are marked <strong>“Verified”</strong> with the date of the check.
          </p>
        </CardBody>
      </Card>

      <Card>
        <CardBody className="space-y-3 text-sm leading-relaxed">
          <h2 className="text-lg font-semibold">Sources we do not publish</h2>
          <p>
            We hold other station lists that have no licence allowing public reuse, such as the Bureau of Energy Efficiency (BEE) list.
            They are not shown on ChargeSetu unless the publisher gives permission.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
