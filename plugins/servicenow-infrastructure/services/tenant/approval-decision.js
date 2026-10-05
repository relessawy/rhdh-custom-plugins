(function executeRule(current, previous) {
  var item = new GlideRecord('sc_req_item');
  if (!item.get(current.sysapproval.toString()) || item.cat_item.toString() !== '__ITEM__') return;
  var state = current.state.toString();
  if (state !== 'approved' && state !== 'rejected') return;
  item.approval = state;
  item.stage = state === 'approved' ? 'fulfillment' : 'request_cancelled';
  if (state === 'rejected') { item.state = '4'; item.active = false; }
  item.update();
})(current, previous);
