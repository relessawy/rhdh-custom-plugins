(function executeRule(current, previous) {
  // Scope is also enforced by the rule condition. Never approve automatically.
  var approval = new GlideRecord('sysapproval_approver');
  approval.addQuery('sysapproval', current.getUniqueValue());
  approval.addQuery('approver', '__APPROVER__');
  approval.query();
  if (!approval.hasNext()) {
    approval.initialize();
    approval.sysapproval = current.getUniqueValue();
    approval.approver = '__APPROVER__';
    approval.state = 'requested';
    approval.insert();
  }
  var item = new GlideRecord('sc_req_item');
  if (item.get(current.getUniqueValue())) {
    item.approval = 'requested';
    item.stage = 'waiting_for_approval';
    item.update();
  }
})(current, previous);
