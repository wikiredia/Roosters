// Chat: je vriendengroep (vastgepind), je woonplaats, en losse gesprekken.
// Routes: #/chat (lijst), #/chat/<chatId>, #/chat/dm/<personId> (opent of maakt een gesprek).
import { h } from "../util.js";
import { emptyState } from "./common.js";

export async function render(root) {
  root.append(emptyState("Chat", "Komt eraan."));
}
