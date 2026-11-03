/** The same text node can stay on screen while the displayed state is unchanged. */
export function updateRepositoryHud(hud,active,interaction,blocked){
 let label='Open a repository to explore';
 if(active){
  const {mode,position}=active.player;
  const coordinates=`${position.x.toFixed(1)}, ${position.y.toFixed(1)}, ${position.z.toFixed(1)}`;
  label=`${active.project.metadata.name} · ${mode} · ${coordinates}${interaction}`;
  if(blocked)label+=' · '+blocked;
 }
 if(hud.textContent!==label)hud.textContent=label;
}
