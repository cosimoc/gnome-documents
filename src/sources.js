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
            this.id = account.get_id();
            this.name = account.get_provider_name();
        } else {
            this.id = params.id;
            this.name = params.name;
        }

        this._initCallback = params.initCallback;

        if (this.id == 'all' || this.id == 'local') {
            this.resourceUrn = null;
            Mainloop.idle_add(Lang.bind(this,
                function() {
                    this._initCallback();
                    return false;
                }));
        } else {
            TrackerUtils.resourceUrnFromSourceId(this.id, Lang.bind(this,
                function(resourceUrn) {
                    this.resourceUrn = resourceUrn;
                    this._initCallback();
                }));
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
        let filter =
            ('(nie:dataSource(?urn) = "%s")').format(this.resourceUrn);

        return filter;
    }
};

function SourceManager(initCallback) {
    this._init(initCallback);
};

SourceManager.prototype = {
    _init: function(initCallback) {
        this._client = null;
        this._sources = {};

        this._initCallback = initCallback;

        // two outstanding ops for the local sources, and one for the GOA client
        this._outstandingOps = 3;

        // Translators: this refers to documents
        let source = new Source({ id: 'all',
                                  name: _("All"),
                                  initCallback: Lang.bind(this, this._initSourceCollector) });
        this._sources[source.id] = source;

        // Translators: this refers to local documents
        source = new Source({ id: 'local',
                              name: _("Local"),
                              initCallback: Lang.bind(this, this._initSourceCollector) });
        this._sources[source.id] = source;

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
                if (!object.get_account())
                    return;

                if (!object.get_documents())
                    return;

                this._outstandingOps++;
                let source = new Source({ object: object,
                                          initCallback: Lang.bind(this, this._initSourceCollector) });
                this._sources[source.id] = source;
            }));

        let activeSourceId = Global.settings.get_string('active-source');
        this.setActiveSourceId(activeSourceId);

        this._initSourceCollector();
    },

    _initSourceCollector: function() {
        this._outstandingOps--;

        if (this._outstandingOps == 0)
            this._initCallback();
    },

    setActiveSourceId: function(id) {
        if (!this._sources[id])
            return;

        this.activeSource = this._sources[id];
        Global.settings.set_string('active-source', this.activeSource.id);

        this.emit('active-source-changed');
    },

    getActiveSourceId: function() {
        return this.activeSource.id;
    },

    getActiveSourceFilter: function() {
        return this.activeSource.getFilter();
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
