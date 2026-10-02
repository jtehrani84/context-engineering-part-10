/**
 * Tests for LogAccountNote — the write action behind the account_update subagent.
 * (The human confirmation lives in Agent Script: require_user_confirmation: True. These tests
 * cover what happens after the user confirms.)
 * Covers: note appended with a timestamp, blank note rejected, no match, and a 150-record
 * bulk write done in one DML statement.
 */
@IsTest
private class LogAccountNoteTest {
    @TestSetup
    static void seed() {
        List<Account> accts = new List<Account>{
            new Account(Name = 'Kit Note Target', Description = 'Existing notes.')
        };
        for (Integer i = 0; i < 150; i++) {
            accts.add(new Account(Name = 'Kit Bulk ' + i));
        }
        insert accts;
    }

    private static LogAccountNote.Request req(String name, String note) {
        LogAccountNote.Request r = new LogAccountNote.Request();
        r.accountName = name;
        r.noteText = note;
        return r;
    }

    @IsTest
    static void appendsTimestampedNoteAndKeepsHistory() {
        Test.startTest();
        List<LogAccountNote.Result> out = LogAccountNote.execute(
            new List<LogAccountNote.Request>{ req('Kit Note Target', 'Renewal call scheduled for next week.') }
        );
        Test.stopTest();

        Assert.isTrue(out[0].isSuccess);
        Assert.areEqual('Note logged to Kit Note Target.', out[0].outputMessage);
        String d = [SELECT Description FROM Account WHERE Name = 'Kit Note Target'].Description;
        Assert.isTrue(d.startsWith('Existing notes.'), 'earlier notes must be kept');
        Assert.isTrue(
            d.contains('] Renewal call scheduled for next week.'),
            'the new note is appended with a timestamp'
        );
    }

    @IsTest
    static void rejectsBlankNote() {
        List<LogAccountNote.Result> out = LogAccountNote.execute(
            new List<LogAccountNote.Request>{ req('Kit Note Target', '   ') }
        );
        Assert.isFalse(out[0].isSuccess);
        Assert.areEqual('Note text is required.', out[0].errorMessage);
        Assert.areEqual(
            'Existing notes.',
            [SELECT Description FROM Account WHERE Name = 'Kit Note Target'].Description,
            'nothing is written when the request is invalid'
        );
    }

    @IsTest
    static void reportsNoMatch() {
        List<LogAccountNote.Result> out = LogAccountNote.execute(
            new List<LogAccountNote.Request>{ req('No Such Account 123', 'x') }
        );
        Assert.isFalse(out[0].isSuccess);
        Assert.isTrue(out[0].errorMessage.contains('No account found'));
    }

    @IsTest
    static void bulkWriteIsOneDmlStatement() {
        List<LogAccountNote.Request> reqs = new List<LogAccountNote.Request>();
        for (Integer i = 0; i < 150; i++) {
            reqs.add(req('Kit Bulk ' + i, 'bulk note ' + i));
        }
        Test.startTest();
        List<LogAccountNote.Result> out = LogAccountNote.execute(reqs);
        Integer dml = Limits.getDmlStatements();
        Test.stopTest();

        Assert.areEqual(150, out.size());
        Assert.areEqual(1, dml, 'all 150 notes land in a single update');
        for (LogAccountNote.Result r : out) {
            Assert.isTrue(r.isSuccess);
        }
        // Description is a long-text field, which SOQL can't filter on, so check it in Apex.
        Integer noted = 0;
        for (Account a : [SELECT Description FROM Account WHERE Name LIKE 'Kit Bulk %']) {
            if (a.Description != null && a.Description.contains('bulk note')) {
                noted++;
            }
        }
        Assert.areEqual(150, noted, 'every bulk request should have landed its note');
    }
}
