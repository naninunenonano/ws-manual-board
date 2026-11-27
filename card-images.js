"use strict";

const frierenTrialCardImages = Object.freeze({
  t04: "025",
  t04sp: "001",
  t09: "030",
  t09r: "012",
  t11: "032",
  t11sp: "002",
  t13: "034",
  t13r: "015"
});

function isFrierenTrialClimax(id){
  return /^SFN\/S108-T09R?$/i.test(String(id));
}

function frierenImageUrl(set,number){
  return "https://heartofthecards.com/images/cards/ws/sfn-"+set+"-"+number+".png";
}

function officialImageUrl(id){
  const match=String(id).match(/^([A-Za-z]+)\/([A-Za-z]+\d+)-([A-Za-z0-9]+)$/);
  if(!match)return null;
  const group=match[1].toLowerCase(),set=match[2].toLowerCase(),number=match[3].toLowerCase();
  if(group==="sfn"){
    if(set==="s108"&&Object.hasOwn(frierenTrialCardImages,number)){
      return "https://www.c-labo-online.jp/data/c-labo/product/wssfns108t_"+frierenTrialCardImages[number]+".jpg";
    }
    return frierenImageUrl(set,number);
  }
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
  const trial=String(id).match(/^SFN\/S108-(T(?:04|09|11|13)[A-Z]*)$/i)?.[1].toLowerCase();
  if(trial&&Object.hasOwn(frierenTrialCardImages,trial))return frierenImageUrl("s108",trial);
  const frieren=String(id).match(/^(SFN\/S\d+-T?\d{2,3})[A-Z]+$/i);
  return match?effectChoiceImageUrl(match[1]):frieren?officialImageUrl(frieren[1]):null;
}

if (typeof module === "object") module.exports = {officialImageUrl,effectChoiceImageUrl,effectChoiceFallbackUrl,isFrierenTrialClimax};
