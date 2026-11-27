"use strict";

function officialImageUrl(id){
  const match=String(id).match(/^([A-Za-z]+)\/([A-Za-z]+\d+)-([A-Za-z0-9]+)$/);
  if(!match)return null;
  const group=match[1].toLowerCase(),set=match[2].toLowerCase(),number=match[3].toLowerCase();
  if(group==="sfn")return "https://heartofthecards.com/images/cards/ws/sfn-"+set+"-"+number+".png";
  const folder=group+"_"+set;
  return "https://ws-tcg.com/wordpress/wp-content/images/cardlist/"+group[0]+"/"+folder+"/"+folder+"_"+number+".png";
}

function effectChoiceImageUrl(id){
  const match=String(id).match(/^STS\/W140-(T?\d{2,3}[A-Z]*)$/i);
  if(!match)return officialImageUrl(id);
  return "https://heartofthecards.com/heartofthecards/images/cards/ws/sts-w140-"+match[1].toLowerCase()+".png";
}

function effectChoiceFallbackUrl(id){
  const match=String(id).match(/^(STS\/W140-T?\d{2,3})[A-Z]+$/i);
  const frieren=String(id).match(/^(SFN\/S\d+-T?\d{2,3})[A-Z]+$/i);
  return match?effectChoiceImageUrl(match[1]):frieren?officialImageUrl(frieren[1]):null;
}

if (typeof module === "object") module.exports = {officialImageUrl,effectChoiceImageUrl};
