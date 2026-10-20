// Samen plannen: pauze-verzoeken ("Reda wil pauze met jou, kan jij?") en wat iedereen ermee kan
// doen vanaf elke plek in de app (Rooster, Vergelijk, Home, Chat).
//
// Contract (andere schermen gebruiken enkel deze exports):
//   breakRequestSheet({ people: [{id, name}], day: "YYYY-MM-DD", start, end, onDone })
//       Onderblad om pauze samen te vragen: ik kom naar jou / jij komt naar mij / afspreken op een plek,
//       van/tot (standaard de hele pauze). Verstuurt POST /api/breaks.
//   plannedBreaksCard({ title }) -> Promise<HTMLElement|null>
//       Kaart met geplande pauzes en verzoeken die onderweg zijn (null als er niets is). Voor Home.
//   personSheet(person, { day, start, end } = {})
//       Onderblad voor één persoon: Vergelijk, Pauze vragen (als er een moment is), Stuur bericht
//       (#/chat/dm/<id>), Vraag om te chillen (POST /api/ping {to_id, kind: "chill"}).
import { go, toast } from "../app.js";
import { h } from "../util.js";

export function breakRequestSheet() {
  toast("Pauze vragen komt eraan");
}

export async function plannedBreaksCard() {
  return null;
}

export function personSheet(person) {
  go(`#/vergelijk?ids=${person.id}`);
  return h("div");
}
