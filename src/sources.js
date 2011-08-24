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
const Signals = imports.signals;

const Goa = imports.gi.Goa;
const _ = imports.gettext.gettext;

function Source(id, name) {
    this._init(id, name);
};

Source.prototype = {
    _init: function(id, name) {
        this.id = id;
        this.name = name;
    }
};

function SourceManager() {
    this._init();
};

SourceManager.prototype = {
    _init: function() {
        this._client = null;
        this.sources = [];

        this.sources.push(new Source('all', _("All")));
        this.sources.push(new Source('local', _("Local")));

        Goa.Client.new(null, Lang.bind(this, this._onGoaClientCreated));
    },

    _onGoaClientCreated: function(object, res) {
        try {
            this._client = Goa.Client.new_finish(res);
        } catch (e) {
            log('Unable to create the GOA client: ' + e.toString());
            return;
        }

        let accounts = this._client.get_accounts();
        let modified = false;

        accounts.forEach(Lang.bind(this,
            function(object) {
                let account = object.get_account();
                if (!account)
                    return;

                if (!object.get_documents())
                    return;

                let id = account.get_id();
                let name = account.get_provider_name();

                this.sources.push(new Source(id, name));
                modified = true;
            }));

        if (modified)
            this.emit('sources-changed');

        let activeSourceId = Main.settings.get_string('active-source');
        this.setActiveSourceId(activeSourceId);
    },

    setActiveSourceId: function(id) {
        let matched = this.sources.filter(Lang.bind(this,
            function(source) {
                return (source.id == id);
            }));

        if (!matched.length)
            return;

        this.activeSource = matched[0];
        Main.settings.set_string('active-source', this.activeSource.id);

        this.emit('active-source-changed');
    },

    getActiveSourceId: function() {
        return this.activeSource.id;
    }
};
Signals.addSignalMethods(SourceManager.prototype);
