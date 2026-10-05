import type {LatLng} from "../domain.js";
const R=6371;
export function distanceKm(a:LatLng,b:LatLng){const dLat=(b.lat-a.lat)*Math.PI/180,dLng=(b.lng-a.lng)*Math.PI/180,a1=a.lat*Math.PI/180,a2=b.lat*Math.PI/180,h=Math.sin(dLat/2)**2+Math.cos(a1)*Math.cos(a2)*Math.sin(dLng/2)**2;return 2*R*Math.asin(Math.sqrt(h))}
export function etaMinutes(km:number,speed=30){return Math.max(1,Math.ceil(km/speed*60))}
