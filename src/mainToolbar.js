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

const Clutter = imports.gi.Clutter;
const Gd = imports.gi.Gd;
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const Gtk = imports.gi.Gtk;
const GtkClutter = imports.gi.GtkClutter;
const Pango = imports.gi.Pango;

const Gettext = imports.gettext;
const _ = imports.gettext.gettext;

const Lang = imports.lang;
const Mainloop = imports.mainloop;

const Global = imports.global;
const Searchbar = imports.searchbar;
const Tweener = imports.util.tweener;

const MainToolbar = new Lang.Class({
    Name: 'MainToolbar',

    _init: function() {
        this._model = null;

        this.widget = new Gd.MainToolbar({ icon_size: Gtk.IconSize.MENU });
        this.widget.get_style_context().add_class(Gtk.STYLE_CLASS_MENUBAR);
        this.widget.show();

        this.layout = new Clutter.BoxLayout({ vertical: true });
        this.actor = new Clutter.Actor({ layout_manager: this.layout });

        this.toolbarActor = new GtkClutter.Actor({ contents: this.widget });

        this.layout.pack(this.toolbarActor,
                         false, true, false,
                         Clutter.BoxAlignment.CENTER, Clutter.BoxAlignment.START);

        this.createSearchbar();
    },

    createSearchbar: function() {
        log('Error: MainToolbar subclasses must implement createSearchbar');
    },

    handleEvent: function(event) {
        let res = this._searchbar.handleEvent(event);
        return res;
    },

    addSearchButton: function() {
        let searchButton =
            this.widget.add_toggle('edit-find-symbolic', _("Search"), false);
        searchButton.action_name = 'app.search';
    }
});

const OverviewToolbar = new Lang.Class({
    Name: 'OverviewToolbar',
    Extends: MainToolbar,

    _init: function(overlayLayout) {
        this._overlayLayout = overlayLayout;
        this._collBackButton = null;
        this._collectionId = 0;
        this._selectionChangedId = 0;

        this.parent();

        // setup listeners to mode changes that affect the toolbar layout
        this._searchStringId =
            Global.searchController.connect('search-string-changed',
                                            Lang.bind(this, this._setToolbarTitle));
        this._searchTypeId =
            Global.searchTypeManager.connect('active-changed',
                                             Lang.bind(this, this._setToolbarTitle));
        this._searchMatchId =
            Global.searchMatchManager.connect('active-changed',
                                              Lang.bind(this, this._setToolbarTitle));
        this._searchSourceId =
            Global.sourceManager.connect('active-changed',
                                         Lang.bind(this, this._setToolbarTitle));
        this._selectionModeId =
            Global.selectionController.connect('selection-mode-changed',
                                               Lang.bind(this, this._resetToolbarMode));
        this._resetToolbarMode();

        this.widget.connect('destroy', Lang.bind(this,
            function() {
                this._clearStateData();

                if (this._selectionModeId != 0) {
                    Global.selectionController.disconnect(this._selectionModeId);
                    this._selectionModeId = 0;
                }

                if (this._searchStringId != 0) {
                    Global.searchController.disconnect(this._searchStringId);
                    this._searchStringId = 0;
                }

                if (this._searchTypeId != 0) {
                    Global.searchTypeManager.disconnect(this._searchTypeId);
                    this._searchTypeId = 0;
                }

                if (this._searchMatchId != 0) {
                    Global.searchMatchManager.disconnect(this._searchMatchId);
                    this._searchMatchId = 0;
                }

                if (this._searchSourceId != 0) {
                    Global.sourceManager.disconnect(this._searchSourceId);
                    this._searchSourceId = 0;
                }
            }));
    },

    _setToolbarTitle: function() {
        let selectionMode = Global.selectionController.getSelectionMode();
        let activeCollection = Global.collectionManager.getActiveItem();
        let primary = null;
        let detail = null;

        if (!selectionMode) {
            if (activeCollection) {
                primary = activeCollection.name;
            } else {
                let string = Global.searchController.getString();

                if (string == '') {
                    let searchType = Global.searchTypeManager.getActiveItem();
                    let searchSource = Global.sourceManager.getActiveItem();

                    if (searchType.id != 'all')
                        primary = searchType.name;
                    else
                        primary = _("New and Recent");

                    if (searchSource.id != 'all')
                        detail = searchSource.name;
                } else {
                    let searchMatch = Global.searchMatchManager.getActiveItem();

                    primary = _("Results for \"%s\"").format(string);
                    if (searchMatch.id == 'title')
                        detail = _("filtered by title");
                    else if (searchMatch.id == 'author')
                        detail = _("filtered by author");
                }
            }
        } else {
            let length = Global.selectionController.getSelection().length;

            if (length == 0)
                detail = _("Click on items to select them");
            else
                detail = Gettext.ngettext("%d selected",
                                          "%d selected",
                                          length).format(length);

            if (activeCollection) {
                primary = activeCollection.name;
            } else if (length != 0) {
                primary = detail;
                detail = null;
            }
        }

        if (detail)
            detail = '(' + detail + ')';

        this.widget.set_labels(primary, detail);
    },

    _populateForSelectionMode: function() {
        this.widget.get_style_context().add_class('documents-selection-mode');
        this.widget.reset_style();

        this.addSearchButton();

        let selectionButton =
            this.widget.add_button(null, _("Done"), false);
        selectionButton.connect('clicked', Lang.bind(this,
            function() {
                Global.selectionController.setSelectionMode(false);
            }));

        // connect to selection changes while in this mode
        this._selectionChangedId =
            Global.selectionController.connect('selection-changed',
                                               Lang.bind(this, this._setToolbarTitle));
    },

    _onActiveCollectionChanged: function() {
        let item = Global.collectionManager.getActiveItem();

        if (item && !this._collBackButton) {
            this._collBackButton =
                this.widget.add_button('go-previous-symbolic', _("Back"), true);
            this._collBackButton.connect('clicked', Lang.bind(this,
                function() {
                    Global.collectionManager.setActiveItem(null);
                }));
        } else if (!item && this._collBackButton) {
            this._collBackButton.destroy();
            this._collBackButton = null;
        }

        this._setToolbarTitle();
        Global.application.change_action_state('search', GLib.Variant.new('b', false));
    },

    _populateForOverview: function() {
        this.addSearchButton();

        let selectionButton =
            this.widget.add_button('object-select-symbolic', _("Select Items"), false);
        selectionButton.connect('clicked', Lang.bind(this,
            function() {
                Global.selectionController.setSelectionMode(true);
            }));

        // connect to active collection changes while in this mode
        this._collectionId =
            Global.collectionManager.connect('active-changed',
                                             Lang.bind(this, this._onActiveCollectionChanged));
    },

    _clearStateData: function() {
        this._collBackButton = null;

        if (this._collectionId != 0) {
            Global.collectionManager.disconnect(this._collectionId);
            this._collectionId = 0;
        }

        if (this._selectionChangedId != 0) {
            Global.selectionController.disconnect(this._selectionChangedId);
            this._selectionChangedId = 0;
        }
    },

    _clearToolbar: function() {
        this._clearStateData();

        this.widget.get_style_context().remove_class('documents-selection-mode');
        this.widget.reset_style();
        this.widget.clear();
    },

    _resetToolbarMode: function() {
        this._clearToolbar();

        let selectionMode = Global.selectionController.getSelectionMode();
        if (selectionMode)
            this._populateForSelectionMode();
        else
            this._populateForOverview();

        this._setToolbarTitle();
        this.widget.show_all();

        if (Global.searchController.getString() != '')
            Global.application.change_action_state('search', GLib.Variant.new('b', true));
    },

    createSearchbar: function() {
        // create the dropdown for the search bar, it's hidden by default
        let dropdown = new Searchbar.Dropdown();
        this._overlayLayout.add(dropdown.actor,
            Clutter.BinAlignment.CENTER, Clutter.BinAlignment.FIXED);
        dropdown.actor.add_constraint(
            new Clutter.BindConstraint({ source: this.toolbarActor,
                                         coordinate: Clutter.BindCoordinate.Y }));

        this._searchbar = new Searchbar.OverviewSearchbar(dropdown);
        this.layout.pack_start = false;
        this.layout.pack(this._searchbar.actor, false, true, false,
                         Clutter.BoxAlignment.CENTER, Clutter.BoxAlignment.START);
    }
});
