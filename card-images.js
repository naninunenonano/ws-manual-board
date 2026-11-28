"use strict";

// Original image filenames matched to their printing in the Card Labo listings.
const cardLaboFiles={
  "STS/W140": ["wsstsw140_", {
    "001":"119","001S":"031","001SP":"006","002":"120","002S":"032","002SP":"007",
    "003":"121","003S":"033","003SP":"008","004":"122","004S":"034","004SP":"009",
    "007":"131","007S":"037","008":"132","008S":"038","008SSP":"002",
    "013":"137","013S":"043","016":"165","016S":"046","019":"168","019S":"049",
    "022":"171","022S":"052","023":"172","023S":"053","024":"173","024S":"054",
    "025":"191","025S":"055","030":"196","030S":"060","031":"151","031P":"241","031R":"019",
    "032":"152","032P":"242","032R":"020","035":"123","035S":"061","035SP":"010",
    "038":"138","038S":"064","038SSP":"004","040":"140","040S":"066",
    "068":"126","068S":"090","068SP":"014","071":"145","071S":"093",
    "076":"150","076S":"098","076SSP":"005","077":"183","077S":"099","094":"216","094S":"116"
  }],
  "STS/W140-T": ["wsstsw140t_", {"03":"026","03S":"006","03SP":"002"}],
  "SFN/S128": ["wssfns128_", {
    "002":"128","003":"129","009":"143","009S":"037","017":"183","017S":"045",
    "021":"185","021S":"049","022":"163","022OFR":"016"
  }],
  "SFN/S136": ["wssfns136_", {
    "001":"116","001PS":"216","001S":"028","002":"117","002PS":"217","002S":"029","002SSP":"001",
    "005":"126","005S":"032","005SP":"005","006":"127","006S":"033","006SP":"006",
    "012":"163","012S":"039","033":"166","033S":"056","034":"167","034S":"057",
    "036":"169","036S":"059","046":"201","046S":"069","048":"173","048S":"071",
    "065":"202","065S":"086","076":"124","076PS":"224","076S":"095","076SP":"014",
    "078":"142","078S":"097"
  }],
  "SFN/S108-T": ["wssfns108t_", {
    "04":"025","04SP":"001","09":"030","09R":"012","11":"032","11SP":"002","13":"034","13R":"015"
  }]
};

function officialImageUrl(id){
  const match=String(id).trim().match(/^([A-Za-z]+)\/([A-Za-z]+\d+)-([A-Za-z0-9]+)$/);
  if(!match)return null;
  const [,title,set,number]=match.map(part=>part.toLowerCase());
  const folder=title+"_"+set;
  return "https://ws-tcg.com/wordpress/wp-content/images/cardlist/"+title[0]+"/"+folder+"/"+folder+"_"+number+".png";
}

function cardLaboImageUrl(id){
  const match=String(id).trim().toUpperCase().match(/^([A-Z]+\/[A-Z]+\d+)-(T?)(\d+[A-Z]*)$/);
  if(!match)return null;
  const set=cardLaboFiles[match[1]+(match[2]?"-T":"")],number=match[3];
  if(!set||!Object.hasOwn(set[1],number))return null;
  return "https://www.c-labo-online.jp/data/c-labo/product/"+set[0]+set[1][number]+".jpg";
}

function cardImageUrl(id){return cardLaboImageUrl(id)??officialImageUrl(id)}
const effectChoiceImageUrl=cardImageUrl;

function isKnownClimaxImage(id){
  return /^(?:STS\/W140-03[12]|SFN\/(?:S108-T09|S128-022))[A-Z]*$/i.test(String(id));
}

function setCardImage(img,id,onMissing,imageUrl=cardImageUrl){
  const source=imageUrl(id),official=officialImageUrl(id);
  if(!source)return false;
  img.onerror=()=>{
    img.onerror=()=>onMissing?.();
    if(source===official)onMissing?.();
    else img.src=official;
  };
  img.src=source;
  return true;
}

if(typeof module==="object")module.exports={officialImageUrl,cardImageUrl,cardLaboImageUrl,effectChoiceImageUrl,isKnownClimaxImage,setCardImage};
