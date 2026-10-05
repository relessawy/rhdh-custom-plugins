(function executeRule(current, previous) {
  var approvals = new GlideRecord('sysapproval_approver');
  approvals.addQuery('sysapproval', current.getUniqueValue());
  approvals.addQuery('approver', '__APPROVER__');
  approvals.query();
  var decision = 'requested';
  if (approvals.next()) {
    var actual = approvals.state.toString();
    if (actual === 'approved' || actual === 'rejected') decision = actual;
  }
  current.approval = decision;
  if (decision === 'requested') current.stage = 'waiting_for_approval';
})(current, previous);
