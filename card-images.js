"use strict";

function officialImageUrl(id){
  const match=String(id).match(/^([A-Za-z]+)\/([A-Za-z]+\d+)-([A-Za-z0-9]+)$/);
  if(!match)return null;
  const group=match[1].toLowerCase(),set=match[2].toLowerCase(),number=match[3].toLowerCase();
  const folder=group+"_"+set;
  return "https://ws-tcg.com/wordpress/wp-content/images/cardlist/"+group[0]+"/"+folder+"/"+folder+"_"+number+".png";
}

if (typeof module === "object") module.exports = {officialImageUrl};
