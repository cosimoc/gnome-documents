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

const Gd = imports.gi.Gd;
const Goa = imports.gi.Goa;

const _ = imports.gettext.gettext;
const Lang = imports.lang;

const ModelColumns = {
    ID: 0,
    NAME: 1
};

function AccountsModel() {
    this._init();
}

AccountsModel.prototype = {
    _init: function() {
        Goa.Client.new(null, Lang.bind(this, this._onGoaClientCreated));

        this.model = Gd.create_combo_store();
        let iter = this.model.append();
        Gd.combo_store_set(this.model, iter,
                           'all', _('All'));

        iter = this.model.append();
        Gd.combo_store_set(this.model, iter,
                           'local', _('Local'));
    },

    _onGoaClientCreated: function(object, res) {
        try {
            this._client = Goa.Client.new_finish(res);
        } catch (e) {
            log('Unable to create the GOA client: ' + e.toString());
            return;
        }

        let accounts = this._client.get_accounts();
        accounts.forEach(Lang.bind(this,
            function(object) {
                let account = object.get_account();
                if (!account)
                    return;

                if (!object.get_documents())
                    return;

                let id = account.get_id();
                let name = account.get_provider_name();

                let iter = this.model.append();
                Gd.combo_store_set(this.model, iter,
                                   id, name);
            }));
    }
};