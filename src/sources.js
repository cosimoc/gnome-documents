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
const Manager = imports.manager;
const TrackerUtils = imports.trackerUtils;

function Source(params) {
    this._init(params);
};

Source.prototype = {
    _init: function(params) {
        this.id = null;
        this.name = null;
        this.icon = null;

        if (params.object) {
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
        if (this.id == 'local')
            return Global.queryBuilder.buildFilterLocal();

        if (this.id == 'all')
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
        Manager.BaseManager.prototype._init.call(this);

        // Translators: this refers to documents
        let source = new Source({ id: 'all',
                                  name: _("All"),
                                  builtin: true });
        this.addItem(source);

        // Translators: this refers to local documents
        source = new Source({ id: 'local',
                              name: _("Local"),
                              builtin: true });
        this.addItem(source);

        Global.goaClient.connect('account-added', Lang.bind(this, this._refreshGoaAccounts));
        Global.goaClient.connect('account-changed', Lang.bind(this, this._refreshGoaAccounts));
        Global.goaClient.connect('account-removed', Lang.bind(this, this._refreshGoaAccounts));

        this._refreshGoaAccounts();
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

        let activeItemId = Global.settings.get_string('active-source');

        // fallback to 'all' if we never saved any source, or if the saved
        // source disappeared in the meantime
        if (!this.setActiveItemById(activeItemId))
            this.setActiveItemById('all');
    },

    setActiveItem: function(item) {
        if (Manager.BaseManager.prototype.setActiveItem.call(this, item))
            Global.settings.set_string('active-source', item.id);
    }
};

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
        this._sourceManager.connect('item-added', Lang.bind(this, this._refreshModel));
        this._sourceManager.connect('item-removed', Lang.bind(this, this._refreshModel));

        this._refreshModel();
    },

    _refreshModel: function() {
        this.model.clear();

        let iter = this.model.append();
        Gd.sources_store_set(this.model, iter,
                             '', _("Sources"), true);

        let sources = this._sourceManager.getItems();
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

                this._sourceManager.setActiveItemById(id);
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
                              if (id == this._sourceManager.getActiveItem().id)
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
