/*
 * Copyright (c) 2011 Red Hat, Inc.
 *
 * Gnome Documents is free software; you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by the
 * Free Software Foundation; either version 2 of the License, or (at your
 * option) any later version.
 *
 * Gnome Documents is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY
 * or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU General Public License
 * for more details.
 *
 * You should have received a copy of the GNU General Public License along
 * with Gnome Documents; if not, write to the Free Software Foundation,
 * Inc., 51 Franklin St, Fifth Floor, Boston, MA  02110-1301  USA
 *
 * Author: Cosimo Cecchi <cosimoc@redhat.com>
 *
 */

const Lang = imports.lang;

const Gio = imports.gi.Gio;
const Goa = imports.gi.Goa;
const _ = imports.gettext.gettext;

const Global = imports.global;
const Manager = imports.manager;

const SourceStock = {
    ALL: 'all',
    LOCAL: 'local'
}

function Source(params) {
    this._init(params);
};

Source.prototype = {
    _init: function(params) {
        this.id = null;
        this.name = null;
        this.icon = null;

        if (params.object) {
            this.object = params.object;
            let account = params.object.get_account();

            this.id = 'gd:goa-account:' + account.id;
            this.name = account.provider_name;
            this.icon = Gio.icon_new_for_string(account.provider_icon);
        } else {
            this.id = params.id;
            this.name = params.name;
        }

        this.builtin = params.builtin;
    },

    getFilter: function() {
        if (this.id == SourceStock.LOCAL)
            return Global.queryBuilder.buildFilterLocal();

        if (this.id == SourceStock.ALL)
            return '(' + Global.queryBuilder.buildFilterLocal() + ' || '
                    + Global.queryBuilder.buildFilterNotLocal() + ')';

        return this._buildFilterResource();
    },

    _buildFilterResource: function() {
        let filter = '(false)';

        if (!this.builtin)
            filter = ('(nie:dataSource(?urn) = "%s")').format(this.id);

        return filter;
    }
};

function SourceManager() {
    this._init();
};

SourceManager.prototype = {
    __proto__: Manager.BaseManager.prototype,

    _init: function() {
        Manager.BaseManager.prototype._init.call(this, _("Sources"));

        // Translators: this refers to documents
        let source = new Source({ id: SourceStock.ALL,
                                  name: _("All"),
                                  builtin: true });
        this.addItem(source);

        // Translators: this refers to local documents
        source = new Source({ id: SourceStock.LOCAL,
                              name: _("Local"),
                              builtin: true });
        this.addItem(source);

        Global.goaClient.connect('account-added', Lang.bind(this, this._refreshGoaAccounts));
        Global.goaClient.connect('account-changed', Lang.bind(this, this._refreshGoaAccounts));
        Global.goaClient.connect('account-removed', Lang.bind(this, this._refreshGoaAccounts));

        this._refreshGoaAccounts();
        this.setActiveItemById(SourceStock.ALL);
    },

    _refreshGoaAccounts: function() {
        let newItems = {};
        let accounts = Global.goaClient.get_accounts();

        accounts.forEach(Lang.bind(this,
            function(object) {
                if (!object.get_account())
                    return;

                if (!object.get_documents())
                    return;

                let source = new Source({ object: object });
                newItems[source.id] = source;
            }));

        this.processNewItems(newItems);
    }
};
