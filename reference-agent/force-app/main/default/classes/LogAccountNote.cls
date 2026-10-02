/**
 * LogAccountNote — mutate invocable backing the account_update subagent.
 * Appends a timestamped note to an account's Description. The Agent Script
 * action that calls this has require_user_confirmation: True, so the human
 * confirms before it runs (the execution / human-gate control).
 *
 * Security: with sharing; `update as user` (USER_MODE DML — running user's
 * CRUD/FLS enforced); bound variable in the WHERE (no SOQL injection);
 * bulk-safe (single DML); no swallowed exceptions (failures surface as
 * errorMessage). The write is attributed to the invoking user.
 */
public with sharing class LogAccountNote {

    public class Request {
        @InvocableVariable(label='Account Name' description='Exact name of the account to update' required=true)
        public String accountName;
        @InvocableVariable(label='Note Text' description='The note to append to the account Description' required=true)
        public String noteText;
    }

    public class Result {
        @InvocableVariable(label='Is Success' description='Whether the note was logged')
        public Boolean isSuccess;
        @InvocableVariable(label='Error Message' description='Populated when the update failed')
        public String errorMessage;
        @InvocableVariable(label='Output Message' description='Human-readable confirmation for the agent to relay')
        public String outputMessage;
    }

    @InvocableMethod(label='Log Account Note' description='Appends a timestamped note to an account Description. Human-confirmed before it runs.')
    public static List<Result> execute(List<Request> requests) {
        List<Result> results = new List<Result>();

        Set<String> names = new Set<String>();
        for (Request req : requests) {
            if (req.accountName != null) {
                names.add(req.accountName);
            }
        }

        Map<String, Account> byName = new Map<String, Account>();
        if (!names.isEmpty()) {
            for (Account a : [
                SELECT Id, Name, Description
                FROM Account
                WHERE Name IN :names
                WITH USER_MODE
                LIMIT 200
            ]) {
                byName.put(a.Name, a);
            }
        }

        List<Account> toUpdate = new List<Account>();
        List<Result> updateResults = new List<Result>();

        for (Request req : requests) {
            Result r = new Result();
            results.add(r);

            Account a = (req.accountName != null) ? byName.get(req.accountName) : null;
            if (a == null) {
                r.isSuccess = false;
                r.errorMessage = 'No account found named: ' + req.accountName;
                continue;
            }
            if (String.isBlank(req.noteText)) {
                r.isSuccess = false;
                r.errorMessage = 'Note text is required.';
                continue;
            }

            String stamp = System.now().format('yyyy-MM-dd HH:mm');
            String existing = (a.Description != null) ? a.Description + '\n' : '';
            a.Description = existing + '[' + stamp + '] ' + req.noteText;
            toUpdate.add(a);
            updateResults.add(r);
        }

        if (!toUpdate.isEmpty()) {
            try {
                update as user toUpdate;
                for (Integer i = 0; i < toUpdate.size(); i++) {
                    updateResults[i].isSuccess = true;
                    updateResults[i].outputMessage = 'Note logged to ' + toUpdate[i].Name + '.';
                }
            } catch (Exception e) {
                for (Result r : updateResults) {
                    r.isSuccess = false;
                    r.errorMessage = e.getMessage();
                }
            }
        }

        return results;
    }
}
