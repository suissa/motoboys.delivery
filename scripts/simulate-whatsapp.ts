import assert from "node:assert/strict";
import {parseIncoming} from "../src/services/whatsapp.js";
const text=parseIncoming({message:{from:"5515999990001",text:{body:"iniciar turno"}}});
assert.equal(text.from,"5515999990001"); assert.equal(text.text,"iniciar turno");
const location=parseIncoming({message:{from:"x",location:{latitude:"-24.1",longitude:"-49.3"}}});
assert.deepEqual(location.location,{lat:-24.1,lng:-49.3});
const media=parseIncoming({message:{from:"x",image:{url:"https://example/photo.jpg"}}});
assert.equal(media.mediaUrl,"https://example/photo.jpg");
console.log(JSON.stringify({simulation:"whatsapp",text,location,media},null,2));
