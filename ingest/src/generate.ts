import { Writer } from "@treecg/connector-types";
import { Parser, Quad } from "n3";

function getX() {
  const r = Math.random();
  if (r < 0.2) return 42;
  if (r < 0.6) return 24;
  return 60;
}

function getY() {
  const r = Math.random();
  if (r < 0.5) return 42;
  if (r < 0.8) return 24;
  return 60;
}
function getId() {
  return "example.com/members#" + Date.now();
}

async function _generate(
  writer: Writer<Quad[]>,
  interval_ms: number,
  timestamp_path: string,
) {
  console.log("Generating!", writer);
  while (true) {
    const x = getX();
    const y = getY();
    const id = getId();
    const quads = `
  <${id}> <x> ${x};
     <y> ${y};
     <${timestamp_path}> "${Date.now()}".
`;

    const qs = new Parser().parse(quads);
    await writer.push(qs);

    console.log("produced! ", qs.length, quads);
    await new Promise((res) => setTimeout(res, interval_ms));
  }
}

export async function generate(
  writer: Writer<Quad[]>,
  interval_ms = 1000,
  timestamp_path =
    "http://def.isotc211.org/iso19156/2011/Observation#OM_Observation.resultTime",
) {
  _generate(writer, interval_ms, timestamp_path);
}
