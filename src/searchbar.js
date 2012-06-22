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
const Gdk = imports.gi.Gdk;
const Gtk = imports.gi.Gtk;
const GtkClutter = imports.gi.GtkClutter;
const Tracker = imports.gi.Tracker;
const _ = imports.gettext.gettext;

const Lang = imports.lang;
const Mainloop = imports.mainloop;
const Signals = imports.signals;

const Global = imports.global;
const Manager = imports.manager;
const Sources = imports.sources;
const Tweener = imports.util.tweener;
const Utils = imports.utils;

const _SEARCH_ENTRY_TIMEOUT = 200;

const SearchCategoryStock = {
    ALL: 'all',
    FAVORITES: 'favorites',
    SHARED: 'shared',
    PRIVATE: 'private'
};

const SearchCategory = new Lang.Class({
    Name: 'SearchCategory',

    _init: function(params) {
        this.id = params.id;
        this.name = params.name;
        this.icon = params.icon;
    },

    getWhere: function() {
        if (this.id == SearchCategoryStock.FAVORITES)
            return '{ ?urn nao:hasTag nao:predefined-tag-favorite }';

        // require to have a contributor, and creator, and they should be different
        if (this.id == SearchCategoryStock.SHARED)
            return '{ ?urn nco:contributor ?contributor . ?urn nco:creator ?creator FILTER (?contributor != ?creator ) }';

        return '';
    },

    getFilter: function() {
        // require to be not local
        if (this.id == SearchCategoryStock.SHARED)
            return Global.queryBuilder.buildFilterNotLocal();

        return '(true)';
    }
});

const SearchCategoryManager = new Lang.Class({
    Name: 'SearchCategoryManager',
    Extends: Manager.BaseManager,

    _init: function() {
        this.parent(_("Category"));

        let category, recent;
        // Translators: this refers to new and recent documents
        recent = new SearchCategory({ id: SearchCategoryStock.ALL,
                                      name: _("All"),
                                      icon: '' });
        this.addItem(recent);

        // Translators: this refers to favorite documents
        category = new SearchCategory({ id: SearchCategoryStock.FAVORITES,
                                        name: _("Favorites"),
                                        icon: 'emblem-favorite-symbolic' });
        this.addItem(category);
        // Translators: this refers to shared documents
        category = new SearchCategory({ id: SearchCategoryStock.SHARED,
                                        name: _("Shared with you"),
                                        icon: 'emblem-shared-symbolic' });
        this.addItem(category);

        // Private category: currently unimplemented
        // category = new SearchCategory(SearchCategoryStock.PRIVATE, _("Private"), 'channel-secure-symbolic');
        // this._categories[category.id] = category;

        this.setActiveItem(recent);
    }
});

const SearchType = new Lang.Class({
    Name: 'SearchType',

    _init: function(params) {
        this.id = params.id;
        this.name = params.name;
        this._filter = (params.filter) ? (params.filter) : '(true)';
        this._where = (params.where) ? (params.where) : '';
    },

    getFilter: function() {
        return this._filter;
    },

    getWhere: function() {
        return this._where;
    }
});

const SearchTypeManager = new Lang.Class({
    Name: 'SearchTypeManager',
    Extends: Manager.BaseManager,

    _init: function() {
        this.parent(_("Type"));

        this.addItem(new SearchType({ id: 'all',
                                      name: _("All") }));
        this.addItem(new SearchType({ id: 'collections',
                                      name: _("Collections"),
                                      filter: 'fn:starts-with(nao:identifier(?urn), \"gd:collection\")',
                                      where: '?urn rdf:type nfo:DataContainer .' }));
        this.addItem(new SearchType({ id: 'pdf',
                                      name: _("PDF Documents"),
                                      filter: 'fn:contains(nie:mimeType(?urn), \"application/pdf\")',
                                      where: '?urn rdf:type nfo:PaginatedTextDocument .' }));
        this.addItem(new SearchType({ id: 'presentations',
                                      name: _("Presentations"),
                                      where: '?urn rdf:type nfo:Presentation .' }));
        this.addItem(new SearchType({ id: 'spreadsheets',
                                      name: _("Spreadsheets"),
                                      where: '?urn rdf:type nfo:Spreadsheet .' }));
        this.addItem(new SearchType({ id: 'textdocs',
                                      name: _("Text Documents"),
                                      where: '?urn rdf:type nfo:PaginatedTextDocument .' }));

        this.setActiveItemById('all');
    },

    getCurrentTypes: function() {
        let activeItem = this.getActiveItem();

        if (activeItem.id == 'all')
            return this.getAllTypes();

        return [ activeItem ];
    },

    getAllTypes: function() {
        let types = [];

        this.forEachItem(function(item) {
            if (item.id != 'all')
                types.push(item);
            });

        return types;
    }
});

const SearchMatchStock = {
    ALL: 'all',
    TITLE: 'title',
    AUTHOR: 'author'
};

const SearchMatch = new Lang.Class({
    Name: 'SearchMatch',

    _init: function(params) {
        this.id = params.id;
        this.name = params.name;
        this._term = '';
    },

    setFilterTerm: function(term) {
        this._term = term;
    },

    getFilter: function() {
        if (this.id == SearchMatchStock.TITLE)
            return ('fn:contains ' +
                    '(fn:lower-case (tracker:coalesce(nie:title(?urn), nfo:fileName(?urn))), ' +
                    '"%s")').format(this._term);
        if (this.id == SearchMatchStock.AUTHOR)
            return ('fn:contains ' +
                    '(fn:lower-case (tracker:coalesce(nco:fullname(?creator), nco:fullname(?publisher))), ' +
                    '"%s")').format(this._term);
        return '';
    }
});

const SearchMatchManager = new Lang.Class({
    Name: 'SearchMatchManager',
    Extends: Manager.BaseManager,

    _init: function() {
        // Translators: this is a verb that refers to "All", "Title" and "Author",
        // as in "Match All", "Match Title" and "Match Author"
        this.parent(_("Match"));

        this.addItem(new SearchMatch({ id: SearchMatchStock.ALL,
                                       name: _("All") }));
        this.addItem(new SearchMatch({ id: SearchMatchStock.TITLE,
                                       name: _("Title") }));
        this.addItem(new SearchMatch({ id: SearchMatchStock.AUTHOR,
                                       name: _("Author") }));

        this.setActiveItemById(SearchMatchStock.ALL);
    },

    getFilter: function() {
        let terms = Global.searchController.getTerms();
        let filters = [];

        for (let i = 0; i < terms.length; i++) {
            this.forEachItem(function(item) {
                item.setFilterTerm(terms[i]);
            });
            filters.push(this.parent());
        }
        return filters.length ? '( ' + filters.join(' && ') + ')' : '';
    }
});

const SearchController = new Lang.Class({
    Name: 'SearchController',

    _init: function() {
        this._dropdownState = false;
        this._string = '';
    },

    setString: function(string) {
        if (this._string == string)
            return;

        this._string = string;
        this.emit('search-string-changed', this._string);
    },

    getString: function() {
        return this._string;
    },

    getTerms: function() {
        let str = Tracker.sparql_escape_string(this._string);
        return str.replace(/ +/g, ' ').split(' ');
    },

    setDropdownState: function(state) {
        if (this._dropdownState == state)
            return;

        this._dropdownState = state;
        this.emit('search-dropdown-changed', this._dropdownState);
    },

    getDropdownState: function() {
        return this._dropdownState;
    }
});
Signals.addSignalMethods(SearchController.prototype);

const Dropdown = new Lang.Class({
    Name: 'Dropdown',

    _init: function() {
        this._sourceView = new Manager.BaseView(Global.sourceManager);
        this._typeView = new Manager.BaseView(Global.searchTypeManager);
        this._matchView = new Manager.BaseView(Global.searchMatchManager);
        // TODO: this is out for now, but should we move it somewhere
        // else?
        // this._categoryView = new Manager.BaseView(Global.searchCategoryManager);

        this._sourceView.connect('item-activated',
                                 Lang.bind(this, this._onItemActivated));
        this._typeView.connect('item-activated',
                               Lang.bind(this, this._onItemActivated));
        this._matchView.connect('item-activated',
                                Lang.bind(this, this._onItemActivated));

        this.widget = new Gtk.Frame({ shadow_type: Gtk.ShadowType.IN });
        this.actor = new GtkClutter.Actor({ contents: this.widget,
                                            opacity: 0 });
        let actorWidget = this.actor.get_widget();
        actorWidget.get_style_context().add_class('documents-dropdown');

        this._grid = new Gtk.Grid({ orientation: Gtk.Orientation.HORIZONTAL });
        this.widget.add(this._grid);

        this._grid.add(this._sourceView.widget);
        this._grid.add(this._typeView.widget);
        this._grid.add(this._matchView.widget);
        //this._grid.add(this._categoryView.widget);

        this.widget.show_all();

        Global.searchController.connect('search-dropdown-changed',
                                        Lang.bind(this, this._onSearchDropdown));
        this._onSearchDropdown();
    },

    _onItemActivated: function() {
        Global.searchController.setDropdownState(false);
    },

    _onSearchDropdown: function() {
        let state = Global.searchController.getDropdownState();
        if (state)
            this._fadeIn();
        else
            this._fadeOut();
    },

    _fadeIn: function() {
        this.actor.raise_top();
        Tweener.addTween(this.actor, { opacity: 245,
                                       time: 0.20,
                                       transition: 'easeOutQuad' });
    },

    _fadeOut: function() {
        Tweener.addTween(this.actor, { opacity: 0,
                                       time: 0.20,
                                       transition: 'easeOutQuad',
                                       onComplete: function() {
                                           this.actor.lower_bottom();
                                       },
                                       onCompleteScope: this });
    }
});

const Searchbar = new Lang.Class({
    Name: 'Searchbar',

    _init: function() {
        this._searchEventId = 0;
        this._searchFocusId = 0;
        this._searchEntryTimeout = 0;
        this._sourcesId = 0;
        this._searchTypeId = 0;
        this._searchMatchId = 0;

        this._in = false;
        this._visible = false;

        this.widget = new Gtk.Toolbar();
        this.widget.get_style_context().add_class(Gtk.STYLE_CLASS_PRIMARY_TOOLBAR);

        this.actor = new GtkClutter.Actor({ contents: this.widget,
                                            height: 0 });

        this._searchEntry = new Gd.TaggedEntry({ width_request: 260,
                                                 no_show_all: true,
                                                 hexpand: true });
        this._searchEntry.connect('tag-clicked',
            Lang.bind(this, this._onTagClicked));

        this._sourcesId = Global.sourceManager.connect('active-changed',
            Lang.bind(this, this._onActiveSourceChanged));
        this._searchTypeId = Global.searchTypeManager.connect('active-changed',
            Lang.bind(this, this._onActiveTypeChanged));
        this._searchMatchId = Global.searchMatchManager.connect('active-changed',
            Lang.bind(this, this._onActiveMatchChanged));
        this._collectionId = Global.collectionManager.connect('active-changed',
            Lang.bind(this, this._onActiveCollectionChanged));

        this._onActiveSourceChanged();
        this._onActiveTypeChanged();
        this._onActiveMatchChanged();

        let box = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL });
        box.add(this._searchEntry);

        this._dropdownButton = new Gtk.ToggleButton(
            { child: new Gtk.Arrow({ arrow_type: Gtk.ArrowType.DOWN }) });
        this._dropdownButton.connect('toggled', Lang.bind(this,
            function() {
                let active = this._dropdownButton.get_active();
                Global.searchController.setDropdownState(active);
            }));

        box.add(this._dropdownButton);

        this._searchDropdownId = Global.searchController.connect('search-dropdown-changed',
            Lang.bind(this, this._onDropdownStateChanged));

        let container = new Gd.MarginContainer({ min_margin: 6,
                                                 max_margin: 64 });
        container.add(box);

        let item = new Gtk.ToolItem();
        item.set_expand(true);
        item.add(container);

        this._searchEntry.connect('key-press-event', Lang.bind(this,
            function(widget, event) {
                let keyval = event.get_keyval()[1];

                if (keyval == Gdk.KEY_Escape) {
                    this.hide();
                    return true;
                }

                return false;
            }));

        this._searchEntry.connect('changed', Lang.bind(this, function() {
            if (this._searchEntryTimeout != 0) {
                Mainloop.source_remove(this._searchEntryTimeout);
                this._searchEntryTimeout = 0;
            }

            this._searchEntryTimeout = Mainloop.timeout_add(_SEARCH_ENTRY_TIMEOUT, Lang.bind(this,
                function() {
                    this._searchEntryTimeout = 0;

                    let currentText = this._searchEntry.get_text().toLowerCase();
                    Global.searchController.setString(currentText);
            }));
        }));

        this.widget.insert(item, 0);
        this._searchEntry.set_text(Global.searchController.getString());

        this.widget.show_all();
    },

    _onActiveCollectionChanged: function() {
        let searchType = Global.searchTypeManager.getActiveItem();

        if (Global.searchController.getString() != '' ||
            searchType.id != 'all') {
            Global.searchTypeManager.setActiveItemById('all');
            this._searchEntry.set_text('');
        }
    },

    destroy: function() {
        if (this._searchFocusId != 0) {
            Global.searchController.disconnect(this._searchFocusId);
            this._searchFocusId = 0;
        }

        if (this._searchEventId != 0) {
            Global.searchController.disconnect(this._searchEventId);
            this._searchEventId = 0;
        }

        if (this._sourcesId != 0) {
            Global.sourceManager.disconnect(this._sourcesId);
            this._sourcesId = 0;
        }

        if (this._searchTypeId != 0) {
            Global.searchTypeManager.disconnect(this._searchTypeId);
            this._searchTypeId = 0;
        }

        if (this._searchMatchId != 0) {
            Global.searchMatchManager.disconnect(this._searchMatchId);
            this._searchMatchId = 0;
        }

        if (this._searchDropdownId != 0) {
            Global.searchController.disconnect(this._searchDropdownId);
            this._searchDropdownId = 0;
        }

        if (this._collectionId != 0) {
            Global.searchController.disconnect(this._collectionId);
            this._collectionId = 0;
        }

        this.widget.destroy();
    },

    _onTagClicked: function() {
        this._dropdownButton.set_active(true);
    },

    _onActiveChangedCommon: function(id, manager) {
        let item = manager.getActiveItem();

        if (item.id == 'all') {
            this._searchEntry.remove_tag(id);
        } else {
            let res = this._searchEntry.add_tag(id, item.name);

            if (res) {
                this._searchEntry.connect('tag-button-clicked::' + id, Lang.bind(this,
                    function() {
                        manager.setActiveItemById('all');
                    }));
            } else {
                this._searchEntry.set_tag_label(id, item.name);
            }
        }
    },

    _onActiveSourceChanged: function() {
        this._onActiveChangedCommon('source', Global.sourceManager);
    },

    _onActiveTypeChanged: function() {
        this._onActiveChangedCommon('type', Global.searchTypeManager);
    },

    _onActiveMatchChanged: function() {
        this._onActiveChangedCommon('match', Global.searchMatchManager);
    },

    _onDropdownStateChanged: function() {
        let state = Global.searchController.getDropdownState();
        this._dropdownButton.set_active(state);
    },

    deliverEvent: function(event) {
        if (this._in)
            return false;

        if (!this._searchEntry.get_realized())
            this._searchEntry.realize();

        let handled = false;

        let preeditChanged = false;
        let preeditChangedId =
            this._searchEntry.connect('preedit-changed', Lang.bind(this,
                function() {
                    preeditChanged = true;
                }));

        let oldText = this._searchEntry.get_text();
        let res = this._searchEntry.event(event);
        let newText = this._searchEntry.get_text();

        this._searchEntry.disconnect(preeditChangedId);

        if (((res && (newText != oldText)) || preeditChanged)) {
            handled = true;

            if (!this._in)
                this.show();
        }

        return handled;
    },

    toggle: function() {
        if (this._visible)
            this.hide();
        else
            this.show();
    },

    show: function() {
        let eventDevice = Gtk.get_current_event_device();

        this._visible = true;
        this._searchEntry.show();

        Tweener.addTween(this.actor, { height: this.widget.get_preferred_height()[1],
                                       time: 0.20,
                                       transition: 'easeOutQuad',
                                       onComplete: function() {
                                           this._in = true;
                                           Gd.entry_focus_hack(this._searchEntry, eventDevice);
                                       },
                                       onCompleteScope: this });
    },

    hide: function() {
        this._dropdownButton.set_active(false);
        this._visible = false;

        Tweener.addTween(this.actor, { height: 0,
                                       time: 0.20,
                                       transition: 'easeOutQuad',
                                       onComplete: function() {
                                           this._searchEntry.hide();
                                           this._in = false;
                                       },
                                       onCompleteScope: this });
    }
});
