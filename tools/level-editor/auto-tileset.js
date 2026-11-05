import { detectAtlasCuts,createGridCuts,estimateFrameGeometry } from './atlas-analysis.js';

export function readAtlasPixels(image) {
  const width=image.naturalWidth||image.width,height=image.naturalHeight||image.height;
  if (!width || !height || width*height>16_777_216) throw new Error('Automatic analysis supports atlases up to 16,777,216 decoded pixels.');
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
  const context=canvas.getContext('2d',{willReadFrequently:true});context.drawImage(image,0,0);
  return context.getImageData(0,0,width,height);
}

export function buildAutomaticManifest(imageData,{name='Imported tileset',imageName='atlas.png',category='prop',collision=true,method='alpha',alphaThreshold=32,minAreaPx=24,mergeGapPx=3,paddingPx=1,cellWidthPx=64,cellHeightPx=64,gridPaddingPx=0,spacingPx=0}={}) {
  if (!['platform','prop','chest','hazard','background','foliage','overhang'].includes(category)) throw new Error('Choose a supported default asset category.');
  let cuts,warnings=[],grid;
  if (method==='grid') {
    cuts=createGridCuts({atlasWidth:imageData.width,atlasHeight:imageData.height,cellWidthPx,cellHeightPx,paddingPx:gridPaddingPx,spacingPx});
    grid={columns:new Set(cuts.map(c=>c.x)).size,rows:new Set(cuts.map(c=>c.y)).size,cellWidthPx,cellHeightPx,paddingPx:gridPaddingPx,spacingPx};
  } else {
    const result=detectAtlasCuts(imageData,{alphaThreshold,minAreaPx,mergeGapPx,paddingPx});cuts=result.cuts;warnings=result.warnings;
  }
  const frames={};let empty=0;
  cuts.forEach((cut,index)=>{
    const sourceRectPx={x:cut.x,y:cut.y,w:cut.w,h:cut.h};
    const geometry=estimateFrameGeometry(imageData,sourceRectPx,{alphaThreshold});
    if (!geometry.contentBoundsPx) {empty++;return;}
    const body=geometry.suggestedRectPx?[{kind:'rect',rectPx:geometry.suggestedRectPx}]:[];
    const frame={name:`Asset ${index+1}`,category,sourceRectPx,measurementStatus:'estimated',notes:geometry.notes,
      contentBoundsPx:geometry.contentBoundsPx,pivotPx:geometry.pivotPx,anchorRole:category==='platform'?'walking_surface':'ground',
      walkSurfacesPx:category==='platform'?geometry.walkSurfacesPx:[],
      solidShapesPx:collision&&['platform','prop'].includes(category)?body:[],
      hazardShapesPx:collision&&category==='hazard'?body:[],interactionShapesPx:collision&&category==='chest'?body:[],components:[]};
    if(category==='platform')frame.terrain={repeatX:'unverified',leftJoinPx:null,rightJoinPx:null,leftCapPx:null,repeatRegionPx:null,rightCapPx:null,compatibleLeftFrameIds:null,compatibleRightFrameIds:null};
    if(category==='background')frame.background={repeatX:'unverified',repeatY:'unverified',horizonYPx:null,groundYPx:null,composition:'unresolved'};
    frames[`cut-${String(index+1).padStart(4,'0')}`]=frame;
  });
  if (!Object.keys(frames).length) throw new Error('No visible assets found. Lower the alpha/noise threshold, use Grid, or choose another image.');
  if (empty) warnings.push(`${empty} empty regions were skipped.`);
  warnings.push('Automatic cuts and geometry are estimates. Review them in Edit asset metadata.');
  return {manifest:{format:'platformer-tileset-manifest',version:1,name,units:'source-image-pixels',coordinateSystem:'top-left-x-right-y-down',
    atlas:{image:imageName,width:imageData.width,height:imageData.height,transparent:true,layout:method==='grid'?'grid':'irregular',...(grid?{grid}:{}),rendering:{filter:'nearest',defaultFacing:'not_applicable'}},
    frames,measurement:{method:'image_analysis',notes:['Alpha-based source analysis; collision roles selected by the author.']},beamPairs:[]},warnings};
}
