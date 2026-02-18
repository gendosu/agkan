import { describe, it, expect, beforeEach } from 'vitest';
import { TagService } from '../src/services/TagService';
import { resetDatabase } from '../src/db/reset';

describe('TagService', () => {
  let tagService: TagService;

  beforeEach(() => {
    // 各テストの前にデータベースをリセット
    resetDatabase();
    tagService = new TagService();
  });

  describe('createTag', () => {
    it('タグを作成できる', () => {
      // タグを作成
      const tag = tagService.createTag({ name: 'bug' });

      // タグが正しく作成されたことを検証
      expect(tag).toBeDefined();
      expect(tag.id).toBeDefined();
      expect(typeof tag.id).toBe('number');
      expect(tag.name).toBe('bug');
      expect(tag.created_at).toBeDefined();
      expect(typeof tag.created_at).toBe('string');
    });

    it('重複したタグ名でエラーが発生する', () => {
      // 最初のタグを作成
      tagService.createTag({ name: 'feature' });

      // 同じ名前のタグを作成しようとするとエラー
      expect(() => {
        tagService.createTag({ name: 'feature' });
      }).toThrow('Tag with name "feature" already exists');
    });

    it('空のname でエラーが発生する', () => {
      expect(() => {
        tagService.createTag({ name: '' });
      }).toThrow('Name is required');
    });

    it('空白のみのnameでエラーが発生する', () => {
      expect(() => {
        tagService.createTag({ name: '   ' });
      }).toThrow('Name is required');
    });

    it('50文字超のnameでエラーが発生する', () => {
      expect(() => {
        tagService.createTag({ name: 'a'.repeat(51) });
      }).toThrow('Name must not exceed 50 characters');
    });

    it('数字のみのnameでエラーが発生する', () => {
      expect(() => {
        tagService.createTag({ name: '123' });
      }).toThrow('Tag name cannot be purely numeric');
    });
  });

  describe('getTag', () => {
    it('タグをIDで取得できる', () => {
      // タグを作成
      const createdTag = tagService.createTag({ name: 'enhancement' });

      // タグをIDで取得
      const tag = tagService.getTag(createdTag.id);

      // タグが正しく取得されたことを検証
      expect(tag).not.toBeNull();
      expect(tag!.id).toBe(createdTag.id);
      expect(tag!.name).toBe('enhancement');
      expect(tag!.created_at).toBe(createdTag.created_at);
    });

    it('存在しないIDではnullを返す', () => {
      // 存在しないIDでタグを取得
      const tag = tagService.getTag(99999);

      // nullが返ることを検証
      expect(tag).toBeNull();
    });
  });

  describe('getTagByName', () => {
    it('タグを名前で取得できる', () => {
      // タグを作成
      const createdTag = tagService.createTag({ name: 'documentation' });

      // タグを名前で取得
      const tag = tagService.getTagByName('documentation');

      // タグが正しく取得されたことを検証
      expect(tag).not.toBeNull();
      expect(tag!.id).toBe(createdTag.id);
      expect(tag!.name).toBe('documentation');
      expect(tag!.created_at).toBe(createdTag.created_at);
    });

    it('存在しない名前ではnullを返す', () => {
      // 存在しない名前でタグを取得
      const tag = tagService.getTagByName('nonexistent');

      // nullが返ることを検証
      expect(tag).toBeNull();
    });
  });

  describe('listTags', () => {
    it('全タグのリストを取得できる', () => {
      // 複数のタグを作成
      const tag1 = tagService.createTag({ name: 'bug' });
      const tag2 = tagService.createTag({ name: 'feature' });
      const tag3 = tagService.createTag({ name: 'refactor' });

      // タグのリストを取得
      const tags = tagService.listTags();

      // リストが正しく取得されたことを検証（作成日時の降順）
      expect(tags).toHaveLength(3);
      expect(tags[0].id).toBe(tag3.id);
      expect(tags[1].id).toBe(tag2.id);
      expect(tags[2].id).toBe(tag1.id);
    });

    it('タグが存在しない場合は空配列を返す', () => {
      // タグのリストを取得
      const tags = tagService.listTags();

      // 空配列が返ることを検証
      expect(tags).toHaveLength(0);
      expect(Array.isArray(tags)).toBe(true);
    });
  });

  describe('updateTag', () => {
    it('タグ名を更新できる', () => {
      // タグを作成
      const tag = tagService.createTag({ name: 'typo' });

      // タグ名を更新
      const updatedTag = tagService.updateTag(tag.id, { name: 'fixed' });

      // タグが正しく更新されたことを検証
      expect(updatedTag).not.toBeNull();
      expect(updatedTag!.id).toBe(tag.id);
      expect(updatedTag!.name).toBe('fixed');
      expect(updatedTag!.created_at).toBe(tag.created_at);
    });

    it('重複したタグ名に更新しようとするとエラーが発生する', () => {
      // 2つのタグを作成
      const tag1 = tagService.createTag({ name: 'urgent' });
      const tag2 = tagService.createTag({ name: 'normal' });

      // tag2をtag1と同じ名前に更新しようとするとエラー
      expect(() => {
        tagService.updateTag(tag2.id, { name: 'urgent' });
      }).toThrow('Tag with name "urgent" already exists');

      // tag1は変更されていないことを確認
      const tag1After = tagService.getTag(tag1.id);
      expect(tag1After!.name).toBe('urgent');

      // tag2も変更されていないことを確認
      const tag2After = tagService.getTag(tag2.id);
      expect(tag2After!.name).toBe('normal');
    });

    it('存在しないタグの更新はnullを返す', () => {
      // 存在しないタグを更新しようとする
      const result = tagService.updateTag(99999, { name: 'new name' });

      // nullが返ることを検証
      expect(result).toBeNull();
    });

    it('空のnameに更新しようとするとエラーが発生する', () => {
      const tag = tagService.createTag({ name: 'valid' });
      expect(() => {
        tagService.updateTag(tag.id, { name: '' });
      }).toThrow('Name is required');
    });

    it('数字のみのnameに更新しようとするとエラーが発生する', () => {
      const tag = tagService.createTag({ name: 'valid' });
      expect(() => {
        tagService.updateTag(tag.id, { name: '42' });
      }).toThrow('Tag name cannot be purely numeric');
    });

    it('50文字超のnameに更新しようとするとエラーが発生する', () => {
      const tag = tagService.createTag({ name: 'valid' });
      expect(() => {
        tagService.updateTag(tag.id, { name: 'a'.repeat(51) });
      }).toThrow('Name must not exceed 50 characters');
    });
  });

  describe('deleteTag', () => {
    it('タグを削除できる', () => {
      // タグを作成
      const tag = tagService.createTag({ name: 'temporary' });

      // タグを削除
      const result = tagService.deleteTag(tag.id);

      // 削除が成功したことを検証
      expect(result).toBe(true);

      // タグが削除されたことを確認
      const deletedTag = tagService.getTag(tag.id);
      expect(deletedTag).toBeNull();
    });

    it('存在しないタグの削除はfalseを返す', () => {
      // 存在しないタグを削除しようとする
      const result = tagService.deleteTag(99999);

      // falseが返ることを検証
      expect(result).toBe(false);
    });
  });
});
