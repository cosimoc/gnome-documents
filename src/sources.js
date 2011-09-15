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
const Mainloop = imports.mainloop;
const Signals = imports.signals;

const Gd = imports.gi.Gd;
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const Goa = imports.gi.Goa;
const Gtk = imports.gi.Gtk;
const Pango = imports.gi.Pango;
const _ = imports.gettext.gettext;

const Global = imports.global;
const TrackerUtils = imports.trackerUtils;

function Source(params) {
    this._init(params);
};

Source.prototype = {
    _init: function(params) {
        this.id = null;
        this.name = null;
        this.object = null;

        if (params.object) {
            this.object = params.object;

            let account = this.object.get_account();
            this.id = account.id;
            this.name = account.provider_name;
        } else {
            this.id = params.id;
            this.name = params.name;
        }

        if (this.id == 'all' || this.id == 'local') {
            this.resourceUrn = null;
        } else {
            this.resourceUrn = 'gd:goa-account:' + this.id;
        }
    },

    getFilter: function() {
        if (this.id == 'local')
            return Global.queryBuilder.buildFilterLocal();

        if (this.id == 'all')
            return Global.queryBuilder.buildFilterLocal() + ' || ' + Global.queryBuilder.buildFilterNotLocal();

        return this._buildFilterResource();
    },

    _buildFilterResource: function() {
        let filter = '(false)';

        if (this.resourceUrn)
            filter = ('(nie:dataSource(?urn) = "%s")').format(this.resourceUrn);

        return filter;
    }
};

function SourceManager() {
    this._init();
};

SourceManager.prototype = {
    _init: function() {
        this._sources = {};
        this._activeSource = null;

        // Translators: this refers to documents
        let source = new Source({ id: 'all',
                                  name: _("All") });
        this._sources[source.id] = source;

        // Translators: this refers to local documents
        source = new Source({ id: 'local',
                              name: _("Local") });
        this._sources[source.id] = source;

        Global.goaClient.connect('account-added', Lang.bind(this, this._refreshGoaAccounts));
        Global.goaClient.connect('account-changed', Lang.bind(this, this._refreshGoaAccounts));
        Global.goaClient.connect('account-removed', Lang.bind(this, this._refreshGoaAccounts));
        this._refreshGoaAccounts();
    },

    _refreshGoaAccounts: function() {
        for (idx in this._sources) {
            if (this._sources[idx].object) {
                delete this._sources[idx];
            }
        }

        let accounts = Global.goaClient.get_accounts();
        let modified = false;

        accounts.forEach(Lang.bind(this,
            function(object) {
                if (!object.get_account())
                    return;

                if (!object.get_documents())
                    return;

                let source = new Source({ object: object });
                this._sources[source.id] = source;
            }));

        let activeSourceId = Global.settings.get_string('active-source');
        if (!this._sources[activeSourceId])
            activeSourceId = 'all';

        this.setActiveSourceId(activeSourceId);
        this.emit('sources-changed');
    },

    setActiveSourceId: function(id) {
        let source = this._sources[id];

        if (!source)
            return;

        if (this._activeSource == source)
            return;

        this._activeSource = source;
        Global.settings.set_string('active-source', this._activeSource.id);

        this.emit('active-source-changed');
    },

    getActiveSourceId: function() {
        return this._activeSource.id;
    },

    getActiveSourceFilter: function() {
        return this._activeSource.getFilter();
    },

    getSourceByUrn: function(resourceUrn) {
        let source = null;
        for (idx in this._sources) {
            if (this._sources[idx].resourceUrn == resourceUrn) {
                source = this._sources[idx];
                break;
            }
        }

        return source;
    },

    getSources: function() {
        return this._sources;
    },

    getRemoteSources: function() {
        let remoteSources = {};

        for (idx in this._sources) {
            if (this._sources[idx].resourceUrn)
                remoteSources[idx] = this._sources[idx];
        }

        return remoteSources;
    }
};
Signals.addSignalMethods(SourceManager.prototype);

// GTK+ implementations

const SourceModelColumns = {
    ID: 0,
    NAME: 1,
    HEADING: 2
};

function SourceModel() {
    this._init();
}

SourceModel.prototype = {
    _init: function() {
        this.model = Gd.create_sources_store();
        this._sourceManager = Global.sourceManager;
        this._sourceManager.connect('sources-changed', Lang.bind(this, this._refreshModel));

        this._refreshModel();
    },

    _refreshModel: function() {
        this.model.clear();

        let iter = this.model.append();
        Gd.sources_store_set(this.model, iter,
                             '', _("Sources"), true);

        let sources = this._sourceManager.getSources();
        for (idx in sources) {
            let source = sources[idx];
            iter = this.model.append();
            Gd.sources_store_set(this.model, iter,
                                 source.id, source.name, false);
        };
    }
};

function SourceView() {
    this._init();
}

SourceView.prototype = {
    _init: function() {
        this._model = new SourceModel();
        this._sourceManager = Global.sourceManager;

        this._treeView = new Gtk.TreeView({ headers_visible: false });
        Gd.gtk_tree_view_set_activate_on_single_click(this._treeView, true);
        this._treeView.set_model(this._model.model);

        this.widget = new Gtk.ScrolledWindow({ hscrollbar_policy: Gtk.PolicyType.NEVER });
        this.widget.add(this._treeView);

        let selection = this._treeView.get_selection();
        selection.set_mode(Gtk.SelectionMode.SINGLE);

        this._treeView.connect('row-activated', Lang.bind(this,
            function(view, path) {
                let iter = this._model.model.get_iter(path)[1];
                let id = this._model.model.get_value(iter, SourceModelColumns.ID);

                this._sourceManager.setActiveSourceId(id);
                this.emit('source-clicked');
            }));

        let col = new Gtk.TreeViewColumn();
        this._treeView.append_column(col);

        // headings
        this._rendererHeading = new Gtk.CellRendererText({ weight: Pango.Weight.BOLD,
                                                           weight_set: true });
        col.pack_start(this._rendererHeading, false);
        col.add_attribute(this._rendererHeading,
                          'text', SourceModelColumns.NAME);
        col.set_cell_data_func(this._rendererHeading,
            Lang.bind(this, this._visibilityForHeading, true));

        // radio selection
        this._rendererRadio = new Gtk.CellRendererToggle({ radio: true,
                                                           mode: Gtk.CellRendererMode.INERT });
        col.pack_start(this._rendererRadio, false);
        col.set_cell_data_func(this._rendererRadio,
            Lang.bind(this, this._visibilityForHeading, false,
                      Lang.bind(this,
                          function(col, cell, model, iter) {
                              let id = model.get_value(iter, SourceModelColumns.ID);
                              if (id == this._sourceManager.getActiveSourceId())
                                  cell.active = true;
                              else
                                  cell.active = false;
                          })));

        // source name
        this._rendererText = new Gtk.CellRendererText();
        col.pack_start(this._rendererText, true);
        col.add_attribute(this._rendererText,
                          'text', SourceModelColumns.NAME);
        col.set_cell_data_func(this._rendererText,
            Lang.bind(this, this._visibilityForHeading, false));

        // arrow
        this._rendererArrow = new Gtk.CellRendererPixbuf({ icon_name: 'go-next-symbolic',
                                                           follow_state: true });
        col.pack_start(this._rendererArrow, false);
        col.set_cell_data_func(this._rendererArrow,
            Lang.bind(this, this._visibilityForHeading, false));

        this.widget.show_all();
    },

    _visibilityForHeading: function(col, cell, model, iter, visible, additionalFunc) {
        let heading = model.get_value(iter, SourceModelColumns.HEADING);

        if ((visible && heading) || (!visible && !heading))
            cell.visible = true;
        else
            cell.visible = false;

        if (additionalFunc)
            additionalFunc(col, cell, model, iter);
    }
};
Signals.addSignalMethods(SourceView.prototype);
